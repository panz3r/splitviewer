// Splitwise OAuth 2.0 routes: /auth/login, /auth/callback, /auth/logout.
//
// Security posture:
// - CSRF: signed short-lived state JWT, mirrored in the sw_state cookie; the
//   callback requires both and they must verify against SESSION_SECRET.
// - Secrets never logged: no console.log of tokens, cookies, or OAuth payloads.
// - Not-configured environments (placeholder client id / missing secrets)
//   return 503 instead of hitting Splitwise with junk.
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { decrypt, encrypt } from "./lib/crypto";
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  signSession,
  signState,
  verifyState,
} from "./lib/session";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  SplitwiseAuthError,
} from "./lib/splitwise";

const PLACEHOLDER_CLIENT_ID = "REPLACE_ME_SPLITWISE_CLIENT_ID";

function allConfigured(env: {
  SPLITWISE_CLIENT_ID?: string;
  SPLITWISE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}): boolean {
  return (
    typeof env.SPLITWISE_CLIENT_ID === "string" &&
    env.SPLITWISE_CLIENT_ID.length > 0 &&
    env.SPLITWISE_CLIENT_ID !== PLACEHOLDER_CLIENT_ID &&
    typeof env.SPLITWISE_CLIENT_SECRET === "string" &&
    env.SPLITWISE_CLIENT_SECRET.length > 0 &&
    typeof env.SESSION_SECRET === "string" &&
    env.SESSION_SECRET.length > 0
  );
}

const COOKIE_FLAGS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export const auth = new Hono<{ Bindings: CloudflareBindings }>()

  .get("/auth/login", async (c) => {
    if (!allConfigured(c.env)) {
      return c.text("OAuth is not configured (missing or placeholder credentials).", 503);
    }
    const state = await signState(c.env.SESSION_SECRET);
    const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
    setCookie(c, STATE_COOKIE, state, { ...COOKIE_FLAGS, maxAge: 600 });
    c.header("Cache-Control", "no-store");
    return c.redirect(
      buildAuthorizeUrl(c.env.SPLITWISE_CLIENT_ID, redirectUri, state),
      302,
    );
  })

  .get("/auth/callback", async (c) => {
    if (!allConfigured(c.env)) {
      return c.text("OAuth is not configured (missing or placeholder credentials).", 503);
    }
    const code = c.req.query("code");
    const returnedState = c.req.query("state");
    if (!code || !returnedState) {
      return c.text("Missing code or state query parameter.", 400);
    }

    const stateCookie = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { ...COOKIE_FLAGS, maxAge: 0 });
    if (!stateCookie || stateCookie !== returnedState) {
      return c.text("State mismatch.", 400);
    }
    const verified = await verifyState(stateCookie, c.env.SESSION_SECRET);
    if (!verified) {
      return c.text("State verification failed.", 400);
    }

    const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
    let tokens;
    try {
      tokens = await exchangeCodeForToken(
        {
          code,
          clientId: c.env.SPLITWISE_CLIENT_ID,
          clientSecret: c.env.SPLITWISE_CLIENT_SECRET,
          redirectUri,
        },
      );
    } catch (error) {
      if (error instanceof SplitwiseAuthError) {
        // Deliberately terse: never echo Splitwise response bodies to the client.
        return c.text("Splitwise authorization failed.", 400);
      }
      throw error;
    }

    const user = await fetchCurrentUser(tokens.accessToken);
    const [encAccess, encRefresh] = await Promise.all([
      encrypt(tokens.accessToken, c.env.TOKEN_ENCRYPTION_KEY),
      encrypt(tokens.refreshToken, c.env.TOKEN_ENCRYPTION_KEY),
    ]);

    await c.env.DB.prepare(
      `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token, token_expiry)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(splitwise_user_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_expiry = excluded.token_expiry,
         updated_at = unixepoch()`,
    )
      .bind(
        crypto.randomUUID(),
        user.id,
        encAccess,
        encRefresh,
        tokens.expiresAt,
      )
      .run();

    const session = await signSession(user.id, c.env.SESSION_SECRET);
    setCookie(c, SESSION_COOKIE, session, { ...COOKIE_FLAGS, maxAge: 2592000 });
    return c.redirect("/dashboard", 302);
  })

  .get("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { ...COOKIE_FLAGS, maxAge: 0 });
    return c.redirect("/", 302);
  });
