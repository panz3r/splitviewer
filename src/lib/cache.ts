// group_cache access + the SWR freshness window (upstream plan: ~7 min).
// CloudflareBindings is ambient from worker-configuration.d.ts.
import type { SanitizedSnapshot } from "./sanitize";

export const FRESH_WINDOW_SECONDS = 7 * 60;

export interface CacheRow {
  snapshot: SanitizedSnapshot;
  lastFetchedAt: number; // unixepoch seconds
}

export async function getCache(env: CloudflareBindings, slug: string): Promise<CacheRow | null> {
  const row = await env.DB.prepare(
    "SELECT payload, last_fetched_at FROM group_cache WHERE slug = ?1",
  )
    .bind(slug)
    .first<{ payload: string; last_fetched_at: number }>();
  if (!row) return null;
  try {
    return { snapshot: JSON.parse(row.payload) as SanitizedSnapshot, lastFetchedAt: row.last_fetched_at };
  } catch {
    // Unparseable cache is as good as no cache.
    return null;
  }
}

export async function setCache(
  env: CloudflareBindings,
  slug: string,
  snapshot: SanitizedSnapshot,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO group_cache (slug, payload, last_fetched_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(slug) DO UPDATE SET payload = ?2, last_fetched_at = ?3`,
  )
    .bind(slug, JSON.stringify(snapshot), nowSeconds)
    .run();
}

export async function deleteCache(env: CloudflareBindings, slug: string): Promise<void> {
  await env.DB.prepare("DELETE FROM group_cache WHERE slug = ?1").bind(slug).run();
}

export function isFresh(lastFetchedAt: number, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds - lastFetchedAt < FRESH_WINDOW_SECONDS;
}
