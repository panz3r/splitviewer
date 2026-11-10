// User record upsert. Returns the ACTUAL stored row id: because the upsert
// keeps the original row on conflict (same Splitwise account re-logging in),
// the INSERT's freshly generated UUID is NOT the id callers may rely on —
// callers (OAuth callback) need whatever id actually lives in the table.
// CloudflareBindings is ambient from worker-configuration.d.ts (wrangler types).
import { SPLITWISE, type TokenResult } from "./splitwise";
import { decrypt, encrypt } from "./crypto";

export interface UpsertUserInput {
  splitwiseUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiry: number | null;
  /** Splitwise avatar URL + first name for the dashboard header widget (may be absent). */
  avatarUrl?: string;
  firstName?: string;
}

export async function upsertUser(
  env: CloudflareBindings,
  input: UpsertUserInput,
): Promise<string> {
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token,
                          token_expiry, avatar_url, first_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(splitwise_user_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_expiry = excluded.token_expiry,
         avatar_url = excluded.avatar_url,
         first_name = excluded.first_name,
         updated_at = unixepoch()`,
    ).bind(
      crypto.randomUUID(),
      input.splitwiseUserId,
      input.encryptedAccessToken,
      input.encryptedRefreshToken,
      input.tokenExpiry,
      input.avatarUrl ?? null,
      input.firstName ?? null,
    ),
    env.DB.prepare(
      "SELECT id FROM users WHERE splitwise_user_id = ?1",
    ).bind(input.splitwiseUserId),
  ]);
  const row = results[1].results[0] as { id?: unknown } | undefined;
  if (typeof row?.id !== "string" || row.id.length === 0) {
    throw new Error("upsertUser: no user id returned after upsert");
  }
  return row.id;
}

// ---- token refresh -----------------------------------------------------------
// Splitwise's observed token responses carry NO refresh_token (stored as ""),
// so refresh is plumbed but usually a no-op. A dead token then simply keeps
// serving stale snapshots; the owner reconnects via /auth/login (dashboard).

interface RefreshableUser {
  id: string;
}

const inFlightRefresh = new Map<string, Promise<boolean>>();

/** Updates stored tokens after a successful refresh. */
async function persistRefreshedTokens(
  env: CloudflareBindings,
  userId: string,
  tokens: TokenResult,
): Promise<void> {
  const encAccess = await encrypt(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const encRefresh = await encrypt(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare(
    `UPDATE users SET encrypted_access_token = ?1, encrypted_refresh_token = ?2,
       token_expiry = ?3, updated_at = unixepoch() WHERE id = ?4`,
  )
    .bind(encAccess, encRefresh, tokens.expiresAt, userId)
    .run();
}

/**
 * Attempts a refresh-token grant for the user. Returns true when the row was
 * updated with fresh credentials. Single-flighted per isolate+user.
 */
export async function refreshUserToken(
  env: CloudflareBindings,
  user: { id: string },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const existing = await env.DB.prepare(
    "SELECT encrypted_refresh_token FROM users WHERE id = ?1",
  )
    .bind(user.id)
    .first<{ encrypted_refresh_token: string }>();
  if (!existing) return false;
  const key = user.id;

  const inflight = inFlightRefresh.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const refreshToken = await decrypt(existing.encrypted_refresh_token, env.TOKEN_ENCRYPTION_KEY);
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

      await persistRefreshedTokens(env, user.id, {
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

