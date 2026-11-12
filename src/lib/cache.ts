// Legacy facade for group_cache access — kept during the MVC transition so
// existing imports keep working; the implementation now lives in
// repositories/cacheRepo.ts (D1CacheRepo) and new code should use it.
import { D1CacheRepo, type CacheRow } from "../repositories/cacheRepo";
import type { SanitizedSnapshot } from "./sanitize";

export { FRESH_WINDOW_SECONDS, isFresh } from "../repositories/cacheRepo";
export type { CacheRow } from "../repositories/cacheRepo";

export async function getCache(env: CloudflareBindings, slug: string): Promise<CacheRow | null> {
  return new D1CacheRepo(env).get(slug);
}

export async function setCache(
  env: CloudflareBindings,
  slug: string,
  snapshot: SanitizedSnapshot,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  return new D1CacheRepo(env).set(slug, snapshot, nowSeconds);
}

export async function deleteCache(env: CloudflareBindings, slug: string): Promise<void> {
  return new D1CacheRepo(env).delete(slug);
}
