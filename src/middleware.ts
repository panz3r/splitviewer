// Session cookie reading (middleware layer) on top of domain/sessionService.
// Unauthenticated API requests get 401 JSON; page routes get a 302 to /auth/login.
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, SESSION_COOKIE } from "./domain/sessionService";
import { D1UsersRepo } from "./repositories/usersRepo";
import { decrypt } from "./lib/crypto";
import type { AppEnv, UserRow } from "./types";

// Compatibility re-exports during the MVC transition — new code imports the
// sign/verify primitives from domain/sessionService.
export {
  STATE_COOKIE,
  SESSION_COOKIE,
  STATE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  signState,
  verifyState,
  signSession,
  verifySession,
} from "./domain/sessionService";

/** Returns the signed-in user's id, or null. Reads the `sw_session` cookie. */
export async function getSessionUserId(c: Context): Promise<string | null> {
  const secret = c.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return null;
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySession(token, secret);
  return payload?.userId ?? null;
}

export async function requireSession(c: Context<AppEnv>, next: Next) {
  const userId = await getSessionUserId(c);
  let row: UserRow | null = null;
  if (userId) {
    row = await new D1UsersRepo(c.env).byId(userId);
  }
  if (!row) {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ ok: false, error: "unauthenticated" }, 401);
    }
    return c.redirect("/auth/login", 302);
  }
  c.set("user", row);
  await next();
}

/** Decrypts the user's stored Splitwise access token for live API calls. */
export async function decAccessToken(
  user: UserRow,
  env: AppEnv["Bindings"],
): Promise<string> {
  return decrypt(user.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY);
}
