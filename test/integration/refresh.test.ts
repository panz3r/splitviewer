import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { encrypt, decrypt } from "../../src/lib/crypto";
import { D1UsersRepo } from "../../src/repositories/usersRepo";
import { refreshUserTokenForEnv as refreshUserToken } from "../../src/wiring";

// Token refresh flow. Splitwise's REAL observed token responses carry no
// refresh_token, so the common path is refreshUserToken → false with zero
// network calls; a present refresh token exercises the grant.

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function userWithRefreshToken(refreshToken: string): Promise<string> {
  const splitwiseId = `refresh-${crypto.randomUUID().slice(0, 8)}`;
  const enc = await encrypt("old-access-token", env.TOKEN_ENCRYPTION_KEY);
  const encRefresh = await encrypt(refreshToken, env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare(
    `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
     VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(crypto.randomUUID(), splitwiseId, enc, encRefresh)
    .run();
  const row = await env.DB.prepare("SELECT id FROM users WHERE splitwise_user_id = ?1")
    .bind(splitwiseId)
    .first<{ id: string }>();
  return row!.id;
}

describe("refreshUserToken", () => {
  it("is a no-op (no network) when no refresh token is stored — the observed Splitwise reality", async () => {
    const userId = await userWithRefreshToken("");
    let networkCalls = 0;
    const spyingFetch: typeof fetch = async (...args) => {
      networkCalls++;
      return jsonResponse({}, 200);
    };
    const result = await refreshUserToken(env, { id: userId }, spyingFetch);
    expect(result).toBe(false);
    expect(networkCalls).toBe(0);

    const row = await env.DB.prepare(
      "SELECT encrypted_access_token FROM users WHERE id = ?1",
    )
      .bind(userId)
      .first<{ encrypted_access_token: string }>();
    expect(await decrypt(row!.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY)).toBe("old-access-token");
  });

  it("performs the refresh grant, persists rotated tokens, and sends form params", async () => {
    const userId = await userWithRefreshToken("rt-123");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ access_token: "new-access", refresh_token: "rt-456", expires_in: 7200 });
    };

    const result = await refreshUserToken(env, { id: userId }, fetchImpl);
    expect(result).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://secure.splitwise.com/oauth/token");
    const body = new URLSearchParams(String(calls[0].init!.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-123");
    expect(body.get("client_id")).toBe(env.SPLITWISE_CLIENT_ID);
    expect(body.get("client_secret")).toBe(env.SPLITWISE_CLIENT_SECRET);
    expect(new Headers(calls[0].init!.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");

    // Row now holds the rotated tokens, decryptable with the real key.
    const row = await env.DB.prepare(
      "SELECT encrypted_access_token, encrypted_refresh_token, token_expiry FROM users WHERE id = ?1",
    )
      .bind(userId)
      .first<{ encrypted_access_token: string; encrypted_refresh_token: string; token_expiry: number | null }>();
    expect(await decrypt(row!.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY)).toBe("new-access");
    expect(await decrypt(row!.encrypted_refresh_token, env.TOKEN_ENCRYPTION_KEY)).toBe("rt-456");
    expect(row!.token_expiry).toBeGreaterThan(Date.now());
  });

  it("returns false when the grant fails (bad refresh token at Splitwise)", async () => {
    const userId = await userWithRefreshToken("rt-777");
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: "invalid_grant" }, 400);
    expect(await refreshUserToken(env, { id: userId }, fetchImpl)).toBe(false);
    // Tokens unchanged.
    const row = await env.DB.prepare(
      "SELECT encrypted_access_token FROM users WHERE id = ?1",
    )
      .bind(userId)
      .first<{ encrypted_access_token: string }>();
    expect(await decrypt(row!.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY)).toBe("old-access-token");
  });

  it("returns false for a user id that does not exist", async () => {
    expect(
      await refreshUserToken(env, { id: crypto.randomUUID() }, async () => jsonResponse({})),
    ).toBe(false);
  });
});

describe("upsertUser (regression guard)", () => {
  it("still returns the stored id across re-logins", async () => {
    const splitwiseId = `stable-${crypto.randomUUID().slice(0, 6)}`;
    const enc = await encrypt("t", env.TOKEN_ENCRYPTION_KEY);
    const a = await new D1UsersRepo(env).upsert({
      splitwiseUserId: splitwiseId,
      encryptedAccessToken: enc,
      encryptedRefreshToken: enc,
      tokenExpiry: null,
    });
    const b = await new D1UsersRepo(env).upsert({
      splitwiseUserId: splitwiseId,
      encryptedAccessToken: enc,
      encryptedRefreshToken: enc,
      tokenExpiry: null,
    });
    expect(b).toBe(a);
  });
});
