import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/crypto";

// 32 bytes as hex — matches the format of the TOKEN_ENCRYPTION_KEY secret.
const KEY = "11".repeat(32);
const OTHER_KEY = "22".repeat(32);

describe("crypto", () => {
	it("round-trips ASCII payloads", async () => {
		const payload = "access-token-123";
		const encrypted = await encrypt(payload, KEY);
		expect(encrypted).not.toContain(payload);
		expect(await decrypt(encrypted, KEY)).toBe(payload);
	});

	it("round-trips unicode payloads", async () => {
		const payload = "Grüße aus Zürich — ひらがな";
		expect(await decrypt(await encrypt(payload, KEY), KEY)).toBe(payload);
	});

	it("round-trips empty payloads", async () => {
		expect(await decrypt(await encrypt("", KEY), KEY)).toBe("");
	});

	it("uses a fresh IV per encryption", async () => {
		const a = await encrypt("same", KEY);
		const b = await encrypt("same", KEY);
		expect(a).not.toBe(b);
		expect(a.length).toBe(b.length); // same plaintext → same length
	});

	it("throws when decrypting with the wrong key", async () => {
		const encrypted = await encrypt("secret", KEY);
		// AES-GCM auth failure must surface as an error, never as corrupted output
		await expect(decrypt(encrypted, OTHER_KEY)).rejects.toThrow();
	});

	it("throws on malformed payloads", async () => {
		await expect(decrypt("no-dot-here", KEY)).rejects.toThrow(/malformed/i);
		await expect(decrypt("x.###", KEY)).rejects.toThrow();
	});

	it("rejects bad keys", async () => {
		await expect(encrypt("a", "")).rejects.toThrow(/empty/i);
		await expect(encrypt("a", "abcd")).rejects.toThrow(/hex string/i);
		await expect(encrypt("a", "zz".repeat(32))).rejects.toThrow(/hex string/i);
	});
});
