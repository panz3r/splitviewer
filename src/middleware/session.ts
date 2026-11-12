// Session middleware (MVC refactor phase 02.11): cookie reading + user
// resolution on top of domain/sessionService and the users repository.
// Unauthenticated API requests get 401 JSON; page routes get a 302 to /auth/login.
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, SESSION_COOKIE } from "../domain/sessionService";
import { D1UsersRepo } from "../repositories/usersRepo";
import type { AppEnv, UserRow } from "../types";

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
