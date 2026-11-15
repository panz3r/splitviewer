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
    // Server-side diagnosability: failed token exchanges carry only
    // { error, error_description } (no tokens — those travel in the request).
    // Whitelist exactly those fields onto the error; never log the body raw.
    let detail = "";
    try {
      const body = (await res.json()) as { error?: unknown; error_description?: unknown };
      if (typeof body.error === "string") detail = body.error;
      if (typeof body.error_description === "string") {
        detail += ` — ${body.error_description.slice(0, 200)}`;
      }
    } catch {
      // non-JSON body: nothing safe to log
    }
    throw new SplitwiseAuthError(
      `Splitwise token exchange failed with status ${res.status}${detail ? ` (${detail})` : ""}`,
      res.status,
    );
  }
  const token = decodeTokenResponse(await res.json());
  if (!token) {
    throw new SplitwiseAuthError("Splitwise token exchange returned no access_token", 500);
  }
  return token;
}

export interface SplitwiseGroup {
  id: string;
  name: string;
  updatedAt?: string;
  /** Group avatar for the dashboard cards (Splitwise CDN URL; anything else). */
  avatarUrl?: string;
  simplifiedDebts: Array<{ amount: string }>;
}

export async function fetchGroups(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SplitwiseGroup[]> {
  const res = await fetchImpl(`${SPLITWISE.API_BASE}/get_groups`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new SplitwiseAuthError("Splitwise rejected the access token", 401);
  }
  if (!res.ok) {
    throw new SplitwiseAuthError(
      `Splitwise get_groups failed with status ${res.status}`,
      res.status,
    );
  }
  const parsed = (await res.json()) as {
    groups?: Array<{
      id?: unknown;
      name?: unknown;
      updated_at?: unknown;
      simplified_debts?: Array<{ amount?: unknown; currency_code?: unknown }>;
      avatar?: unknown;
    }>;
  };
  if (!Array.isArray(parsed.groups)) {
    throw new SplitwiseAuthError("Splitwise get_groups returned no groups array", 500);
  }
  return parsed.groups
    .filter((g) => typeof g.id === "number" || typeof g.id === "string")
    .map((g) => ({
      id: String(g.id),
      name: typeof g.name === "string" ? g.name : "",
      updatedAt: typeof g.updated_at === "string" ? g.updated_at : undefined,
      // Dashboard sorting needs "settled up" state; snapshot values only.
      simplifiedDebts: (g.simplified_debts ?? [])
        .filter((d) => d.amount != null)
        .map((d) => ({ amount: String(d.amount ?? "") })),
      avatarUrl: parsePictureUrl(g.avatar ?? null),
    }));
}

/** First available small/medium-sized avatar URL from a Splitwise picture object. */
function parsePictureUrl(picture: unknown): string | undefined {
  if (picture == null || typeof picture !== "object") return undefined;
  const p = picture as Record<string, unknown>;
  for (const size of ["small", "medium", "large"]) {
    if (typeof p[size] === "string" && (p[size] as string).length > 0) {
      return p[size] as string;
    }
  }
  return undefined;
}

/**
 * Group cover photo from GET /get_group/{id} (`cover_photo`). The value shape
 * has been observed both as a plain URL string and as a size object
 * ({small, medium, large}) — parse defensively, preferring the largest variant
 * (the cover is a full-bleed background, quality matters).
 */
function parseCoverPhoto(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }
  if (value == null || typeof value !== "object") return undefined;
  const p = value as Record<string, unknown>;
  for (const size of ["large", "medium", "small"]) {
    if (typeof p[size] === "string" && (p[size] as string).length > 0) {
      return p[size] as string;
    }
  }
  if (typeof p.url === "string" && p.url.length > 0) {
    return p.url;
  }
  return undefined;
}

export interface SplitwiseUser {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

/** Raw (unsanitized) group as returned by GET /get_group/{id}. */
export interface RawGroup {
  id: string;
  name: string;
  updatedAt?: string;
  /** Group cover photo URL (Splitwise CDN); group-level asset, may be absent. */
  coverUrl?: string;
  members: Array<{ id: string; firstName: string; lastName: string }>;
  simplifiedDebts: Array<{ from: string; to: string; amount: string; currencyCode: string }>;
  raw?: unknown; // kept for debugging; never persisted/rendered
}

export async function fetchGroup(
  accessToken: string,
  groupId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RawGroup> {
  const res = await fetchImpl(`${SPLITWISE.API_BASE}/get_group/${encodeURIComponent(groupId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new SplitwiseAuthError("Splitwise rejected the access token", 401);
  }
  if (!res.ok) {
    throw new SplitwiseAuthError(
      `Splitwise get_group failed with status ${res.status}`,
      res.status,
    );
  }
  const parsed = (await res.json()) as {
    group?: {
      id?: unknown;
      name?: unknown;
      updated_at?: unknown;
      cover_photo?: unknown;
      members?: Array<{ id?: unknown; first_name?: unknown; last_name?: unknown }>;
      simplified_debts?: Array<{ from?: unknown; to?: unknown; amount?: unknown; currency_code?: unknown }>;
    };
  };
  const group = parsed.group;
  if (!group || (typeof group.id !== "number" && typeof group.id !== "string")) {
    throw new SplitwiseAuthError("Splitwise get_group returned no group", 500);
  }
  return {
    id: String(group.id),
    name: typeof group.name === "string" ? group.name : "",
    updatedAt: typeof group.updated_at === "string" ? group.updated_at : undefined,
    coverUrl: parseCoverPhoto(group.cover_photo ?? null),
    members: (group.members ?? [])
      .filter((m) => typeof m.first_name === "string")
      .map((m) => ({
        id: String(m.id ?? ""),
        firstName: m.first_name as string,
        lastName: typeof m.last_name === "string" ? m.last_name : "",
      })),
    simplifiedDebts: (group.simplified_debts ?? [])
      .filter((d) => d.amount != null && d.currency_code != null)
      .map((d) => ({
        from: String(d.from ?? ""),
        to: String(d.to ?? ""),
        amount: String(d.amount ?? ""),
        currencyCode: String(d.currency_code ?? ""),
      })),
    raw: group,
  };
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
    user?: {
      id?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      picture?: Record<string, unknown> | null;
    };
  };
  const user = parsed.user;
  const id = user?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new SplitwiseAuthError("Splitwise get_current_user returned no user id", 500);
  }
  return {
    id: String(id),
    firstName: typeof user?.first_name === "string" ? user.first_name : undefined,
    lastName: typeof user?.last_name === "string" ? user.last_name : undefined,
    avatarUrl: parsePictureUrl(user?.picture ?? null),
  };
}

// ---- Client interface (MVC refactor phase 02.5) ------------------------------
// Domain services depend on narrow structural slices of this interface (e.g.
// Pick<SplitwiseClient, "fetchGroup">), so unit tests can pass partial fakes.

export interface SplitwiseClient {
  exchangeCodeForToken(input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<TokenResult>;
  fetchCurrentUser(accessToken: string): Promise<SplitwiseUser>;
  fetchGroups(accessToken: string): Promise<SplitwiseGroup[]>;
  fetchGroup(accessToken: string, groupId: string): Promise<RawGroup>;
}

export function createHttpSplitwiseClient(fetchImpl: typeof fetch = fetch): SplitwiseClient {
  return {
    exchangeCodeForToken: (input) => exchangeCodeForToken(input, fetchImpl),
    fetchCurrentUser: (token) => fetchCurrentUser(token, fetchImpl),
    fetchGroups: (token) => fetchGroups(token, fetchImpl),
    fetchGroup: (token, groupId) => fetchGroup(token, groupId, fetchImpl),
  };
}
