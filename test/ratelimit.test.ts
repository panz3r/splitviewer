import { describe, expect, it } from "vitest";
import { rateLimit } from "../src/lib/ratelimit";

describe("rateLimit", () => {
  it("allows up to limit, then 429s with retry-after inside the window", () => {
    const start = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      const r = rateLimit("test-bucket", "ip-1", 5, 60_000, start);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const blocked = rateLimit("test-bucket", "ip-1", 5, 60_000, start + 1_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets when the window elapses", () => {
    const start = 1_700_100_000_000;
    for (let i = 0; i < 3; i++) rateLimit("b2", "ip", 3, 60_000, start);
    expect(rateLimit("b2", "ip", 3, 60_000, start + 60_000).ok).toBe(true);
  });

  it("buckets are independent per name and identity", () => {
    const now = 1_700_200_000_000;
    expect(rateLimit("b3", "ipA", 1, 60_000, now).ok).toBe(true);
    expect(rateLimit("b3", "ipA", 1, 60_000, now).ok).toBe(false);
    expect(rateLimit("b3", "ipB", 1, 60_000, now).ok).toBe(true);
    expect(rateLimit("b4", "ipA", 1, 60_000, now).ok).toBe(true);
  });
});
