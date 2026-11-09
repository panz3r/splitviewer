import { env } from "cloudflare:workers";
import { encrypt } from "../src/lib/crypto";
import { describe, expect, it } from "vitest";

// D1 schema smoke test: the migration was applied by test/apply-migrations.ts.
// This is the exact write path Phase 2's /auth/callback will use.
const TOKEN_KEY = "33".repeat(32); // test-only local encryption key

describe("d1 schema", () => {
	it("stores an encrypted user and reads it back", async () => {
		const userId = crypto.randomUUID();
		const accessToken = await encrypt("sw-access-token", TOKEN_KEY);
		const refreshToken = await encrypt("sw-refresh-token", TOKEN_KEY);

		const result = await env.DB.prepare(
			`INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token, token_expiry)
			 VALUES (?1, ?2, ?3, ?4, ?5)`,
		)
			.bind(userId, "1234", accessToken, refreshToken, Date.now() + 3600_000)
			.run();
		expect(result.success).toBe(true);

		const row = await env.DB.prepare(
			"SELECT * FROM users WHERE id = ?1",
		)
			.bind(userId)
			.first();
		expect(row).toBeTruthy();
		expect(row?.splitwise_user_id).toBe("1234");
	});

	it("rejects duplicate splitwise_user_id (UNIQUE constraint)", async () => {
		const accessToken = await encrypt("t", TOKEN_KEY);
		await env.DB.prepare(
			`INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
			 VALUES (?1, ?2, ?3, ?4)`,
		)
			.bind(crypto.randomUUID(), "dup-user-1", accessToken, accessToken)
			.run();
		await expect(
			env.DB.prepare(
				`INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
				 VALUES (?1, ?2, ?3, ?4)`,
			)
				.bind(crypto.randomUUID(), "dup-user-1", accessToken, accessToken)
				.run(),
		).rejects.toThrow();
	});

	it("stores a share with valid is_active and rejects invalid values", async () => {
		const userId = crypto.randomUUID();
		const accessToken = await encrypt("t", TOKEN_KEY);
		await env.DB.prepare(
			`INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
			 VALUES (?1, ?2, ?3, ?4)`,
		)
			.bind(userId, "parent-user", accessToken, accessToken)
			.run();

		const inserted = await env.DB.prepare(
			`INSERT INTO shares (slug, user_id, splitwise_group_id, group_name)
			 VALUES (?1, ?2, ?3, ?4)`,
		)
			.bind("slugabc123xyz456", userId, "999", "Test Flat")
			.run();
		expect(inserted.success).toBe(true);

		const share = await env.DB.prepare("SELECT * FROM shares WHERE slug = ?1")
			.bind("slugabc123xyz456")
			.first();
		expect(share?.is_active).toBe(1);

		await expect(
			env.DB.prepare(
				`INSERT INTO shares (slug, user_id, splitwise_group_id, group_name, is_active)
				 VALUES (?1, ?2, ?3, ?4, ?5)`,
			)
				.bind("slugbad999xyz456", userId, "998", "Bad", 2)
				.run(),
		).rejects.toThrow();
	});
});
