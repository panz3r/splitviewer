// Signed-JWT helpers for OAuth state (CSRF) and post-login sessions.
// Both use HS256 with SESSION_SECRET; `typ` distinguishes the two so a session
// token can never be replayed as state and vice versa.
import { sign, verify } from "hono/jwt";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { SessionPayload, StatePayload } from "./jwt-types";

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

export async function signSession(userId: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    typ: "session",
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  return sign(payload, secret, "HS256");
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const payload = (await verify(token, secret, "HS256").catch(() => null)) as unknown;
  if (payload && (payload as SessionPayload).typ === "session") {
    return payload as SessionPayload;
  }
  return null;
}

/** Returns the signed-in user's id, or null. Reads the `sw_session` cookie. */
export async function getSessionUserId(c: Context): Promise<string | null> {
  const secret = c.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return null;
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySession(token, secret);
  return payload?.userId ?? null;
}
