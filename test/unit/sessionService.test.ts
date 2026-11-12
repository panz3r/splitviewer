import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  signSession,
  signState,
  verifySession,
  verifyState,
} from "../../src/domain/sessionService";

const KEY = "test-secret";

describe("state tokens", () => {
  it("signs and verifies", async () => {
    const token = await signState(KEY);
    const payload = await verifyState(token, KEY);
    expect(payload?.typ).toBe("oauth_state");
    const now = Math.floor(Date.now() / 1000);
    expect(payload!.exp).toBeGreaterThan(now + STATE_TTL_SECONDS - 120);
    expect(payload!.exp).toBeLessThanOrEqual(now + STATE_TTL_SECONDS);
  });

  it("rejects wrong secrets", async () => {
    const token = await signState(KEY);
    expect(await verifyState(token, "other-secret")).toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await signState(KEY);
    const [head, payload, sig] = token.split(".");
    const tampered = `${head}.${btoa("garbage").replace(/=/g, "")}.${sig}`;
    expect(await verifyState(tampered, KEY)).toBeNull();
    expect(await verifyState(`${head}.${payload}.AAAA`, KEY)).toBeNull();
  });

  it("rejects state tokens replayed as sessions and versa", async () => {
    const state = await signState(KEY);
    expect(await verifySession(state, KEY)).toBeNull();
    const session = await signSession("u1", KEY);
    expect(await verifyState(session, KEY)).toBeNull();
  });
});

describe("session tokens", () => {
  it("signs with a userId claim and 30-day expiry", async () => {
    const token = await signSession("uuid-1", KEY);
    const payload = await verifySession(token, KEY);
    expect(payload?.typ).toBe("session");
    expect(payload?.userId).toBe("uuid-1");
    const now = Math.floor(Date.now() / 1000);
    expect(payload!.exp).toBeLessThanOrEqual(now + SESSION_TTL_SECONDS);
    expect(payload!.exp).toBeGreaterThan(now + SESSION_TTL_SECONDS - 120);
  });

  it("rejects expired tokens", async () => {
    const expired = await sign(
      { typ: "oauth_state", exp: Math.floor(Date.now() / 1000) - 10 },
      KEY,
      "HS256",
    );
    expect(await verifyState(expired, KEY)).toBeNull();
  });
});

describe("cookie names", () => {
  it("are stable", () => {
    expect(STATE_COOKIE).toBe("sw_state");
    expect(SESSION_COOKIE).toBe("sw_session");
  });
});
