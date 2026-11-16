// Splitwise OAuth 2.0 routes: /auth/login, /auth/callback, /auth/logout.
//
// Security posture:
// - CSRF: signed short-lived state JWT, mirrored in the sw_state cookie; the
//   callback requires both and they must verify against SESSION_SECRET.
// - Secrets never logged: no console.log of tokens, cookies, or OAuth payloads.
// - Not-configured environments (placeholder client id / missing secrets)
//   return 503 instead of hitting Splitwise with junk.
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { decrypt, encrypt } from "../lib/crypto";
import { getSessionPayload } from "../middleware/session";
import { D1UsersRepo } from "../repositories/usersRepo";
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  signSession,
  signState,
  verifyState,
} from "../domain/sessionService";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  SplitwiseAuthError,
} from "../lib/splitwise";
import { upsertUser } from "../lib/users";
import type { AppEnv } from "../types";

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

// Cookie attributes: Secure only on https origins (Safari refuses Secure
// cookies over http://localhost, which breaks local dev logins).
function cookieFlags(c: Context<AppEnv>) {
  const isHttps = new URL(c.req.url).protocol === "https:";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax" as const,
    path: "/",
  };
}

export const auth = new Hono<AppEnv>()

  .get("/auth/login", async (c) => {
    if (!allConfigured(c.env)) {
      return c.text("OAuth is not configured (missing or placeholder credentials).", 503);
    }
    const state = await signState(c.env.SESSION_SECRET);
    const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
    setCookie(c, STATE_COOKIE, state, { ...cookieFlags(c), maxAge: 600 });
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
    deleteCookie(c, STATE_COOKIE, { ...cookieFlags(c), maxAge: 0 });
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
        // Server-side visibility for ops: status + generic message only —
        // never the response body or any credential material. The client
        // stays deliberately terse ("Splitwise authorization failed.").
        console.error("oauth token exchange failed:", error.message);
        return c.text("Splitwise authorization failed.", 400);
      }
      throw error;
    }

    const user = await fetchCurrentUser(tokens.accessToken);
    const [encAccess, encRefresh] = await Promise.all([
      encrypt(tokens.accessToken, c.env.TOKEN_ENCRYPTION_KEY),
      encrypt(tokens.refreshToken, c.env.TOKEN_ENCRYPTION_KEY),
    ]);

    const storedUserId = await upsertUser(c.env, {
      splitwiseUserId: user.id,
      encryptedAccessToken: encAccess,
      encryptedRefreshToken: encRefresh,
      tokenExpiry: tokens.expiresAt,
      avatarUrl: user.avatarUrl,
      firstName: user.firstName,
    });
    // Sign the session with the ACTUAL stored row id: on re-login the upsert
    // keeps the existing row (and its id); signing a freshly generated UUID
    // would create a session that references a nonexistent user, making every
    // re-login bounce into the authorize loop.
    const storedUser = await new D1UsersRepo(c.env).byId(storedUserId);
    const session = await signSession(
      storedUserId,
      c.env.SESSION_SECRET,
      storedUser?.session_version ?? 0,
    );
    setCookie(c, SESSION_COOKIE, session, { ...cookieFlags(c), maxAge: 2592000 });
    return c.redirect("/dashboard", 302);
  })

  // POST-only (SameSite=Lax keeps cross-site forms from logging users out).
  // Logout revokes every outstanding session of the user server-side, so a
  // copied/stolen cookie stops working too.
  .post("/auth/logout", async (c) => {
    const session = await getSessionPayload(c);
    if (session) {
      await new D1UsersRepo(c.env).revokeSessions(session.userId);
    }
    deleteCookie(c, SESSION_COOKIE, { ...cookieFlags(c), maxAge: 0 });
    return c.redirect("/", 302);
  });
