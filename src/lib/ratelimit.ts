// Best-effort per-isolate rate limiting for public endpoints.
// Workers Free has no Durable Objects, no Rate Limiting binding, and no WAF
// control over *.workers.dev — this in-memory fixed-window limiter is the
// honest MVP mitigation. It never touches D1 (flood mitigation must not
// amplify load), is bounded in memory, and softness across isolates is
// accepted and documented.
import type { Context, Next } from "hono";

const MAX_KEYS = 10_000;

interface Window {
  windowStart: number;
  counts: Map<string, number>;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  bucketName: string,
  identityKey: string,
  limit: number,
  windowMs: number = 60_000,
  nowMs: number = Date.now(),
): RateLimitResult {
  let win = windows.get(bucketName);
  if (!win || nowMs - win.windowStart >= windowMs) {
    win = { windowStart: nowMs, counts: new Map() };
    windows.set(bucketName, win);
  }

  // Memory guard: a flood of rotating IPs evicts wholesale; miscounting within
  // that window is the cheaper wrong answer.
  if (win.counts.size >= MAX_KEYS && !win.counts.has(identityKey)) {
    win.counts.clear();
  }

  const count = (win.counts.get(identityKey) ?? 0) + 1;
  win.counts.set(identityKey, count);

  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((win.windowStart + windowMs - nowMs) / 1000)),
  };
}

/**
 * Client IP for bucketing. Cloudflare always sets CF-Connecting-IP on real
 * traffic; client-supplied headers like X-Forwarded-For are deliberately
 * ignored (rotating them would mint a fresh bucket per request).
 */
function clientIp(c: Context): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

/**
 * Rate-limit middleware factory for public routes.
 * Buckets are per-isolate; each route class gets its own name.
 */
export function ipRateLimit(bucketName: string, limit: number) {
  return async (c: Context, next: Next) => {
    const result = rateLimit(bucketName, clientIp(c), limit);
    if (!result.ok) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.text("Too many requests", 429);
    }
    await next();
  };
}
