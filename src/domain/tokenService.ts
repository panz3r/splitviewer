// Token service (domain layer): refresh-token grant against Splitwise.
// Splitwise's observed token responses carry NO refresh_token (stored as ""),
// so refresh is plumbed but usually a no-op. A dead token then simply keeps
// serving stale snapshots; the owner reconnects via /auth/login (dashboard).
import { decrypt } from "../lib/crypto";
import { SPLITWISE, type TokenResult } from "../lib/splitwise";
import type { UsersRepo } from "../repositories/usersRepo";

const inFlightRefresh = new Map<string, Promise<boolean>>();

export interface TokenServiceDeps {
  users: Pick<UsersRepo, "encryptedRefreshToken" | "storeTokens">;
  clientId: string;
  clientSecret: string;
  tokenEncryptionKey: string;
}

/**
 * Attempts a refresh-token grant for the user. Returns true when the row was
 * updated with fresh credentials. Single-flighted per isolate+user.
 */
export function createTokenService(deps: TokenServiceDeps, fetchImpl: typeof fetch = fetch) {
  return async function refreshUserToken(user: { id: string }): Promise<boolean> {
    const storedEncryptedRefresh = await deps.users.encryptedRefreshToken(user.id);
    if (!storedEncryptedRefresh) return false;
    const key = user.id;

    const inflight = inFlightRefresh.get(key);
    if (inflight) return inflight;

    const task = (async () => {
      try {
        const refreshToken = await decrypt(storedEncryptedRefresh, deps.tokenEncryptionKey);
        // No refresh token issued by Splitwise → cannot refresh (common case).
        if (!refreshToken) return false;

        const res = await fetchImpl(SPLITWISE.TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: deps.clientId,
            client_secret: deps.clientSecret,
          }).toString(),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        };
        if (typeof json.access_token !== "string" || !json.access_token) return false;

        const tokens: TokenResult = {
          accessToken: json.access_token,
          refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : refreshToken,
          expiresAt: typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : null,
        };
        await deps.users.storeTokens(user.id, tokens);
        return true;
      } catch {
        return false;
      } finally {
        inFlightRefresh.delete(key);
      }
    })();
    inFlightRefresh.set(key, task);
    return task;
  };
}
