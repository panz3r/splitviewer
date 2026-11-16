// Users repository (MVC refactor phase 02.2): the ONLY module that touches the
// `users` table. Interface + D1 implementation + in-memory implementation.
//
// The D1 impl owns the encryption step for tokens-at-rest (behavior contract:
// the AES key lives in TOKEN_ENCRYPTION_KEY, never in code) — callers pass
// plaintext tokens, rows always hold ciphertext.
import { decrypt, encrypt } from "../lib/crypto";
import { SPLITWISE, type TokenResult } from "../lib/splitwise";
import type { UserRow } from "../types";

export interface UpsertUserInput {
  splitwiseUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiry: number | null;
  /** Splitwise avatar URL + first name for the dashboard header widget (may be absent). */
  avatarUrl?: string;
  firstName?: string;
}

/** Raw plaintext token pair (already validated by the caller). */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export interface UsersRepo {
  /**
   * Upsert keyed on splitwise_user_id. Returns the ACTUAL stored row id: the
   * upsert keeps the original row on conflict (same Splitwise account
   * re-logging in), so the INSERT's freshly generated UUID is NOT the id
   * callers may rely on — sessions must be signed with the stored id.
   */
  upsert(input: UpsertUserInput): Promise<string>;
  byId(id: string): Promise<UserRow | null>;
  /** Stored (still-encrypted) refresh token, or null when the user is missing. */
  encryptedRefreshToken(id: string): Promise<string | null>;
  /** Persists rotated tokens, encrypting them with the environment key. */
  storeTokens(userId: string, tokens: StoredTokens): Promise<void>;
  /** Invalidates every outstanding session for the user (bumps session_version). */
  revokeSessions(userId: string): Promise<void>;
}

// ---- D1 implementation -------------------------------------------------------

export class D1UsersRepo implements UsersRepo {
  constructor(private readonly env: CloudflareBindings) {}

  async upsert(input: UpsertUserInput): Promise<string> {
    const results = await this.env.DB.batch([
      this.env.DB.prepare(
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
      this.env.DB.prepare(
        "SELECT id FROM users WHERE splitwise_user_id = ?1",
      ).bind(input.splitwiseUserId),
    ]);
    const row = results[1].results[0] as { id?: unknown } | undefined;
    if (typeof row?.id !== "string" || row.id.length === 0) {
      throw new Error("D1UsersRepo.upsert: no user id returned after upsert");
    }
    return row.id;
  }

  async byId(id: string): Promise<UserRow | null> {
    const row = await this.env.DB.prepare(
      "SELECT id, splitwise_user_id, encrypted_access_token, token_expiry, avatar_url, first_name, session_version FROM users WHERE id = ?1",
    )
      .bind(id)
      .first<UserRow>();
    return row ?? null;
  }

  async encryptedRefreshToken(id: string): Promise<string | null> {
    const row = await this.env.DB.prepare(
      "SELECT encrypted_refresh_token FROM users WHERE id = ?1",
    )
      .bind(id)
      .first<{ encrypted_refresh_token: string }>();
    return row?.encrypted_refresh_token ?? null;
  }

  async storeTokens(userId: string, tokens: StoredTokens): Promise<void> {
    const [encAccess, encRefresh] = await Promise.all([
      encrypt(tokens.accessToken, this.env.TOKEN_ENCRYPTION_KEY),
      encrypt(tokens.refreshToken, this.env.TOKEN_ENCRYPTION_KEY),
    ]);
    await this.env.DB.prepare(
      `UPDATE users SET encrypted_access_token = ?1, encrypted_refresh_token = ?2,
         token_expiry = ?3, updated_at = unixepoch() WHERE id = ?4`,
    )
      .bind(encAccess, encRefresh, tokens.expiresAt, userId)
      .run();
  }

  async revokeSessions(userId: string): Promise<void> {
    await this.env.DB.prepare(
      "UPDATE users SET session_version = session_version + 1, updated_at = unixepoch() WHERE id = ?1",
    )
      .bind(userId)
      .run();
  }
}

// ---- In-memory implementation (unit tests) -----------------------------------

export class InMemoryUsersRepo implements UsersRepo {
  /** Plaintext storage by design: unit tests inject their own crypto checks. */
  readonly rows = new Map<
    string,
    { id: string; splitwiseUserId: string; accessToken: string; refreshToken: string; expiresAt: number | null; sessionVersion: number }
  >();

  private nextId = 0;

  async upsert(input: UpsertUserInput): Promise<string> {
    const existing = [...this.rows.values()].find(
      (r) => r.splitwiseUserId === input.splitwiseUserId,
    );
    if (existing) {
      existing.accessToken = input.encryptedAccessToken;
      existing.refreshToken = input.encryptedRefreshToken;
      existing.expiresAt = input.tokenExpiry;
      return existing.id;
    }
    const id = `mem-user-${++this.nextId}`;
    this.rows.set(id, {
      id,
      splitwiseUserId: input.splitwiseUserId,
      accessToken: input.encryptedAccessToken,
      refreshToken: input.encryptedRefreshToken,
      expiresAt: input.tokenExpiry,
      sessionVersion: 0,
    });
    return id;
  }

  async byId(id: string): Promise<UserRow | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    return {
      id: row.id,
      splitwise_user_id: row.splitwiseUserId,
      encrypted_access_token: row.accessToken,
      token_expiry: row.expiresAt,
      avatar_url: null,
      first_name: null,
      session_version: row.sessionVersion,
    };
  }

  async encryptedRefreshToken(id: string): Promise<string | null> {
    return this.rows.get(id)?.refreshToken ?? null;
  }

  async storeTokens(userId: string, tokens: StoredTokens): Promise<void> {
    const row = this.rows.get(userId);
    if (row) {
      row.accessToken = tokens.accessToken;
      row.refreshToken = tokens.refreshToken;
      row.expiresAt = tokens.expiresAt;
    }
  }

  async revokeSessions(userId: string): Promise<void> {
    const row = this.rows.get(userId);
    if (row) row.sessionVersion += 1;
  }
}
