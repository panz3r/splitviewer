// JWT payload shapes for src/lib/session.ts; the index signature is required
// for compatibility with hono/jwt's JWTPayload type.
export interface StatePayload {
  [key: string]: unknown;
  typ: "oauth_state";
  exp: number;
}

export interface SessionPayload {
  [key: string]: unknown;
  typ: "session";
  userId: string;
  /** users.session_version at sign time; a mismatch means the session was revoked. */
  sv: number;
  exp: number;
}
