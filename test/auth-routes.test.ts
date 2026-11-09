import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src";
import { signSession, verifyState, signState } from "../src/lib/session";

// Route-level tests against the real app. Env comes from the workers test
// integration (wrangler.jsonc vars + .dev.vars; values may be placeholders —
// routes must not hit the network for the paths we assert here).
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const fetchRoute = async (path: string, init?: RequestInit) => {
  const request = new IncomingRequest(`https://example.com${path}`, init);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

describe("GET /auth/login", () => {
  it("302s to splitwise authorize with sw_state cookie", async () => {
    const res = await fetchRoute("/auth/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const location = res.headers.get("Location") ?? "";
    expect(location.startsWith("https://secure.splitwise.com/oauth/authorize?")).toBe(true);
    const params = new URL(location).searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("state")).toBeTruthy();

    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("sw_state=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("returns 503 when credentials are placeholders", async () => {
    const request = new IncomingRequest("https://example.com/auth/login");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, { ...env, SPLITWISE_CLIENT_ID: "REPLACE_ME_SPLITWISE_CLIENT_ID" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(503);
  });
});

describe("GET /auth/callback", () => {
  it("rejects missing state cookie (400)", async () => {
    const state = await signState(env.SESSION_SECRET);
    const res = await fetchRoute(`/auth/callback?code=x&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(400);
  });

  it("rejects state mismatch between query and cookie (400)", async () => {
    const [a, b] = [await signState(env.SESSION_SECRET), await signState(env.SESSION_SECRET)];
    const res = await fetchRoute(`/auth/callback?code=x&state=${encodeURIComponent(a)}`, {
      headers: { Cookie: `sw_state=${b}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects forged state (signature invalid, 400)", async () => {
    const forged = await signSession("u1", "attacker-secret");
    const res = await fetchRoute(`/auth/callback?code=x&state=${encodeURIComponent(forged)}`, {
      headers: { Cookie: `sw_state=${forged}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing code or state query params", async () => {
    const state = await signState(env.SESSION_SECRET);
    const res = await fetchRoute("/auth/callback?state=x", {
      headers: { Cookie: `sw_state=${state}` },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/logout", () => {
  it("clears the session cookie and redirects home", async () => {
    const res = await fetchRoute("/auth/logout");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("sw_session=");
    // expired cookie → cleared
    expect(cookie.toLowerCase()).toContain("max-age=0");
  });
});

describe("state/session helpers against env secret", () => {
  it("round-trip with the real SESSION_SECRET from the test env", async () => {
    const state = await signState(env.SESSION_SECRET);
    const payload = await verifyState(state, env.SESSION_SECRET);
    expect(payload?.typ).toBe("oauth_state");
  });
});
