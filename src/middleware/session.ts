// Session middleware: cookie reading + user
// resolution on top of domain/sessionService and the users repository.
// Unauthenticated API requests get 401 JSON; page routes get a 302 to /auth/login.
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, SESSION_COOKIE } from "../domain/sessionService";
import type { SessionPayload } from "../lib/jwt-types";
import { D1UsersRepo } from "../repositories/usersRepo";
import type { AppEnv, UserRow } from "../types";

/** Returns the verified session payload, or null. Reads the `sw_session` cookie. */
export async function getSessionPayload(c: Context): Promise<SessionPayload | null> {
  const secret = c.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return null;
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, secret);
}

/** Signed-in user's id from the cookie alone (no revocation check — use
 *  requireSession to gate anything sensitive). */
export async function getSessionUserId(c: Context): Promise<string | null> {
  return (await getSessionPayload(c))?.userId ?? null;
}

export async function requireSession(c: Context<AppEnv>, next: Next) {
  const session = await getSessionPayload(c);
  let row: UserRow | null = null;
  if (session) {
    row = await new D1UsersRepo(c.env).byId(session.userId);
    // Revoked (logged out) sessions carry a stale version.
    if (row && row.session_version !== session.sv) row = null;
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
