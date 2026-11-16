// group_cache repository (MVC refactor phase 02.4): the ONLY module that
// touches the `group_cache` table, plus the SWR freshness window (upstream
// plan: ~7 min). Interface + D1 implementation + in-memory implementation.
import type { SanitizedSnapshot } from "../domain/sanitizeService";

export const FRESH_WINDOW_SECONDS = 7 * 60;

export interface CacheRow {
  snapshot: SanitizedSnapshot;
  lastFetchedAt: number; // unixepoch seconds
}

export interface CacheRepo {
  /** Parsed snapshot + fetch time, or null when missing/unparseable. */
  get(slug: string): Promise<CacheRow | null>;
  /** Upsert keyed on slug. */
  set(slug: string, snapshot: SanitizedSnapshot, nowSeconds: number): Promise<void>;
  /** Hard delete (revocation must beat the cache). */
  delete(slug: string): Promise<void>;
}

export function isFresh(
  lastFetchedAt: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  return nowSeconds - lastFetchedAt < FRESH_WINDOW_SECONDS;
}

// ---- D1 implementation -------------------------------------------------------

export class D1CacheRepo implements CacheRepo {
  constructor(private readonly env: CloudflareBindings) {}

  async get(slug: string): Promise<CacheRow | null> {
    const row = await this.env.DB.prepare(
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

  async set(slug: string, snapshot: SanitizedSnapshot, nowSeconds: number): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO group_cache (slug, payload, last_fetched_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(slug) DO UPDATE SET payload = ?2, last_fetched_at = ?3`,
    )
      .bind(slug, JSON.stringify(snapshot), nowSeconds)
      .run();
  }

  async delete(slug: string): Promise<void> {
    await this.env.DB.prepare("DELETE FROM group_cache WHERE slug = ?1").bind(slug).run();
  }
}

// ---- In-memory implementation (unit tests) -----------------------------------

export class InMemoryCacheRepo implements CacheRepo {
  readonly rows = new Map<string, CacheRow>();

  async get(slug: string): Promise<CacheRow | null> {
    return this.rows.get(slug) ?? null;
  }

  async set(slug: string, snapshot: SanitizedSnapshot, nowSeconds: number): Promise<void> {
    this.rows.set(slug, { snapshot, lastFetchedAt: nowSeconds });
  }

  async delete(slug: string): Promise<void> {
    this.rows.delete(slug);
  }
}
