// Users persistence + token refresh. Since the MVC refactor, storage lives in
// repositories/usersRepo.ts; this module keeps the env-shaped convenience
// signatures the OAuth callback and refresh flow rely on. Refresh itself is
// domain logic (single-flighted per isolate+user).
import { decrypt } from "./crypto";
import { SPLITWISE, type TokenResult } from "./splitwise";
import { D1UsersRepo, type UpsertUserInput } from "../repositories/usersRepo";

export type { UpsertUserInput } from "../repositories/usersRepo";

export async function upsertUser(
  env: CloudflareBindings,
  input: UpsertUserInput,
): Promise<string> {
  return new D1UsersRepo(env).upsert(input);
}

// ---- token refresh -----------------------------------------------------------
// Splitwise's observed token responses carry NO refresh_token (stored as ""),
// so refresh is plumbed but usually a no-op. A dead token then simply keeps
// serving stale snapshots; the owner reconnects via /auth/login (dashboard).

interface RefreshableUser {
  id: string;
}

const inFlightRefresh = new Map<string, Promise<boolean>>();

/**
 * Attempts a refresh-token grant for the user. Returns true when the row was
 * updated with fresh credentials. Single-flighted per isolate+user.
 */
export async function refreshUserToken(
  env: CloudflareBindings,
  user: { id: string },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const repo = new D1UsersRepo(env);
  const storedEncryptedRefresh = await repo.encryptedRefreshToken(user.id);
  if (!storedEncryptedRefresh) return false;
  const key = user.id;

  const inflight = inFlightRefresh.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const refreshToken = await decrypt(storedEncryptedRefresh, env.TOKEN_ENCRYPTION_KEY);
      // No refresh token issued by Splitwise → cannot refresh (common case).
      if (!refreshToken) return false;

      const res = await fetchImpl(SPLITWISE.TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: env.SPLITWISE_CLIENT_ID,
          client_secret: env.SPLITWISE_CLIENT_SECRET,
        }).toString(),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (typeof json.access_token !== "string" || !json.access_token) return false;

      await repo.storeTokens(user.id, {
        accessToken: json.access_token,
        refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : refreshToken,
        expiresAt: typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : null,
      });
      return true;
    } catch {
      return false;
    } finally {
      inFlightRefresh.delete(key);
    }
  })();
  inFlightRefresh.set(key, task);
  return task;
}
