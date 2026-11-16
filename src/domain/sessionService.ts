// Signed-JWT session/state primitives (domain layer). Both use HS256 with
// SESSION_SECRET; `typ` distinguishes the two so a session token can never be
// replayed as state and vice versa. Cookie handling stays in middleware —
// this module is pure crypto.
import { sign, verify } from "hono/jwt";
import type { SessionPayload, StatePayload } from "../lib/jwt-types";

export const STATE_COOKIE = "sw_state";
export const SESSION_COOKIE = "sw_session";

export const STATE_TTL_SECONDS = 10 * 60; // OAuth round-trip should take well under a minute
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function signState(secret: string): Promise<string> {
  const payload: StatePayload = {
    typ: "oauth_state",
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  return sign(payload, secret, "HS256");
}

export async function verifyState(token: string, secret: string): Promise<StatePayload | null> {
  const payload = (await verify(token, secret, "HS256").catch(() => null)) as unknown;
  if (payload && (payload as StatePayload).typ === "oauth_state") {
    return payload as StatePayload;
  }
  return null;
}

export async function signSession(
  userId: string,
  secret: string,
  sessionVersion = 0,
): Promise<string> {
  const payload: SessionPayload = {
    typ: "session",
    userId,
    sv: sessionVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  return sign(payload, secret, "HS256");
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const payload = (await verify(token, secret, "HS256").catch(() => null)) as unknown;
  // Tokens without an `sv` claim predate server-side revocation: reject them.
  if (
    payload &&
    (payload as SessionPayload).typ === "session" &&
    typeof (payload as SessionPayload).sv === "number"
  ) {
    return payload as SessionPayload;
  }
  return null;
}
