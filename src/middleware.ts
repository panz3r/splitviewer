// Shared auth middleware + helper for Phase 3+ routes.
// Unauthenticated API requests get 401 JSON; page routes get a 302 to /auth/login.
import type { Context, Next } from "hono";
import { decrypt } from "./lib/crypto";
import { getSessionUserId } from "./lib/session";
import type { AppEnv, UserRow } from "./types";

export async function requireSession(c: Context<AppEnv>, next: Next) {
  const userId = await getSessionUserId(c);
  let row: UserRow | null = null;
  if (userId) {
    row = await c.env.DB.prepare(
      "SELECT id, splitwise_user_id, encrypted_access_token, token_expiry, avatar_url, first_name FROM users WHERE id = ?1",
    )
      .bind(userId)
      .first<UserRow>();
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
