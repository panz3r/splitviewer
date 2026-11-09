// User record upsert. Returns the ACTUAL stored row id: because the upsert
// keeps the original row on conflict (same Splitwise account re-logging in),
// the INSERT's freshly generated UUID is NOT the id callers may rely on —
// callers (OAuth callback) need whatever id actually lives in the table.
// CloudflareBindings is ambient from worker-configuration.d.ts (wrangler types).

export interface UpsertUserInput {
  splitwiseUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiry: number | null;
}

export async function upsertUser(
  env: CloudflareBindings,
  input: UpsertUserInput,
): Promise<string> {
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token, token_expiry)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(splitwise_user_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_expiry = excluded.token_expiry,
         updated_at = unixepoch()`,
    ).bind(
      crypto.randomUUID(),
      input.splitwiseUserId,
      input.encryptedAccessToken,
      input.encryptedRefreshToken,
      input.tokenExpiry,
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
