import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, exchangeCodeForToken, fetchCurrentUser, SplitwiseAuthError } from "../src/lib/splitwise";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const captureFetch = (response: Response) => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return response;
  };
  return { calls, fetchImpl };
};

const okTokenBody = { access_token: "tok_123", token_type: "bearer" };

describe("buildAuthorizeUrl", () => {
  it("builds the splitwise authorize URL with expected params", () => {
    const url = new URL(buildAuthorizeUrl("cid", "http://localhost:8787/auth/callback", "state-xyz"));
    expect(url.origin + url.pathname).toBe("https://secure.splitwise.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8787/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-xyz");
  });
});

describe("exchangeCodeForToken", () => {
  it("posts form-encoded body with the required params", async () => {
    const { calls, fetchImpl } = captureFetch(jsonResponse(okTokenBody));
    const result = await exchangeCodeForToken(
      { code: "the-code", clientId: "cid", clientSecret: "csec", redirectUri: "http://localhost:8787/auth/callback" },
      fetchImpl,
    );
    expect(result.accessToken).toBe("tok_123");
    expect(result.refreshToken).toBe(""); // splitwise response has no refresh_token — tolerated
    expect(result.expiresAt).toBeNull();
    expect(calls).toHaveLength(1);
    const init = calls[0].init!;
    expect(String(calls[0].input)).toBe("https://secure.splitwise.com/oauth/token");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csec");
    expect(body.get("redirect_uri")).toBe("http://localhost:8787/auth/callback");
  });

  it("parses expires_in/refresh_token when present", async () => {
    const before = Date.now();
    const { fetchImpl } = captureFetch(
      jsonResponse({ ...okTokenBody, refresh_token: "r_1", expires_in: 3600 }),
    );
    const result = await exchangeCodeForToken(
      { code: "c", clientId: "cid", clientSecret: "csec", redirectUri: "r" },
      fetchImpl,
    );
    expect(result.refreshToken).toBe("r_1");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600_000 - 1000);
  });

  it("maps non-200 token responses to SplitwiseAuthError with the http status", async () => {
    const { fetchImpl } = captureFetch(jsonResponse({ error: "invalid_grant" }, 400));
    await expect(
      exchangeCodeForToken({ code: "c", clientId: "cid", clientSecret: "csec", redirectUri: "r" }, fetchImpl),
    ).rejects.toMatchObject({ name: "SplitwiseAuthError", status: 400 });
  });

  it("throws SplitwiseAuthError when access_token is missing", async () => {
    const { fetchImpl } = captureFetch(jsonResponse({}));
    await expect(
      exchangeCodeForToken({ code: "c", clientId: "cid", clientSecret: "csec", redirectUri: "r" }, fetchImpl),
    ).rejects.toBeInstanceOf(SplitwiseAuthError);
  });
});

describe("fetchCurrentUser", () => {
  it("sends the bearer token and parses the user", async () => {
    const { calls, fetchImpl } = captureFetch(
      jsonResponse({ user: { id: 123, first_name: "Marco", last_name: "Panzeri" } }),
    );
    const user = await fetchCurrentUser("tok_123", fetchImpl);
    expect(user).toEqual({ id: "123", firstName: "Marco", lastName: "Panzeri" });
    expect(new Headers(calls[0].init!.headers).get("Authorization")).toBe("Bearer tok_123");
  });

  it("throws SplitwiseAuthError on 401", async () => {
    const { fetchImpl } = captureFetch(jsonResponse({}, 401));
    await expect(fetchCurrentUser("bad", fetchImpl)).rejects.toMatchObject({
      name: "SplitwiseAuthError",
      status: 401,
    });
  });
});
