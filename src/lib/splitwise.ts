// Splitwise API client (OAuth 2.0 + REST).
//
// Verified facts (see plans/phase-2-oauth.md):
// - Token exchange is POST, application/x-www-form-urlencoded, params in the
//   body (client_id/secret/code/redirect_uri/grant_type) — not JSON, not Basic auth.
// - Observed token responses contain only access_token + token_type; refresh
//   token / expires_in may be absent — parse defensively, never throw.
// - API v3.0 (https://secure.splitwise.com/api/v3.0) uses `Authorization: Bearer <token>`.
export const SPLITWISE = {
  AUTHORIZE_URL: "https://secure.splitwise.com/oauth/authorize",
  TOKEN_URL: "https://secure.splitwise.com/oauth/token",
  API_BASE: "https://secure.splitwise.com/api/v3.0",
} as const;

export interface TokenResult {
  accessToken: string;
  refreshToken: string; // "" when Splitwise doesn't issue one
  expiresAt: number | null; // epoch ms, null when no expiry returned
}

export class SplitwiseAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SplitwiseAuthError";
    this.status = status;
  }
}

export function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${SPLITWISE.AUTHORIZE_URL}?${params.toString()}`;
}

function decodeTokenResponse(json: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): TokenResult | null {
  if (typeof json.access_token !== "string" || json.access_token.length === 0) {
    return null;
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : "",
    expiresAt: typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : null,
  };
}

export async function exchangeCodeForToken(
  input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const res = await fetchImpl(SPLITWISE.TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new SplitwiseAuthError(
      `Splitwise token exchange failed with status ${res.status}`,
      res.status,
    );
  }
  const token = decodeTokenResponse(await res.json());
  if (!token) {
    throw new SplitwiseAuthError("Splitwise token exchange returned no access_token", 500);
  }
  return token;
}

export interface SplitwiseUser {
  id: string;
  firstName?: string;
  lastName?: string;
}

export async function fetchCurrentUser(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SplitwiseUser> {
  const res = await fetchImpl(`${SPLITWISE.API_BASE}/get_current_user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new SplitwiseAuthError("Splitwise rejected the access token", 401);
  }
  if (!res.ok) {
    throw new SplitwiseAuthError(
      `Splitwise get_current_user failed with status ${res.status}`,
      res.status,
    );
  }
  const parsed = (await res.json()) as {
    user?: { id?: unknown; first_name?: unknown; last_name?: unknown };
  };
  const id = parsed.user?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new SplitwiseAuthError("Splitwise get_current_user returned no user id", 500);
  }
  return {
    id: String(id),
    firstName: typeof parsed.user?.first_name === "string" ? parsed.user.first_name : undefined,
    lastName: typeof parsed.user?.last_name === "string" ? parsed.user.last_name : undefined,
  };
}
