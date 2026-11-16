// Share lifecycle service (domain layer): create (with slug-rotation retry)
// and revoke (instant: drops the cached snapshot). Framework-agnostic —
// repositories and slug generation arrive via injected deps.
import type { SharesRepo } from "../repositories/sharesRepo";
import type { CacheRepo } from "../repositories/cacheRepo";

export const SLUG_LENGTH = 16;

/** Raised after 3 consecutive write attempts failed (maps to HTTP 500). */
export class ShareWriteError extends Error {
  constructor() {
    super("share write failed after 3 attempts");
    this.name = "ShareWriteError";
  }
}

export interface ShareServiceDeps {
  shares: SharesRepo;
  /** Revocation must be instant: dropping the cache makes "revoked" and
   *  "missing" truly identical for the public page. */
  cache: Pick<CacheRepo, "delete">;
  generateSlug?: () => string;
  onWriteError?: (error: unknown) => void;
}

export function createShareService(deps: ShareServiceDeps) {
  const generateSlug =
    deps.generateSlug ??
    (() => {
      // No silent default: slug entropy is a security property, so callers
      // (wiring.ts) must inject the generator explicitly.
      throw new Error("ShareServiceDeps.generateSlug is required");
    });
  const onWriteError =
    deps.onWriteError ??
    (() => {
      console.error("shares/create: failed after 3 attempts");
    });

  return {
    /**
     * Create (or rotate) a share for a group. Upsert keyed on
     * (user_id, splitwise_group_id): re-sharing replaces the slug, quietly
     * killing any old public link WITHOUT needing cascade deletes elsewhere.
     * Retries on unknown D1/SQLite failures (slug-PK collisions are
     * astronomically rare); throws ShareWriteError after 3 attempts.
     */
    async create(userId: string, splitwiseGroupId: string, groupName: string): Promise<string> {
      let slug = generateSlug();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await deps.shares.createOrRotate({ userId, splitwiseGroupId, groupName, slug });
          return slug;
        } catch (error) {
          slug = generateSlug();
          if (attempt === 2) {
            onWriteError(error);
            throw new ShareWriteError();
          }
        }
      }
      throw new ShareWriteError(); // unreachable
    },

    /** Deactivates the caller's own share. False when not found / not owned. */
    async revoke(userId: string, slug: string): Promise<boolean> {
      const changed = await deps.shares.deactivate(userId, slug);
      if (changed) {
        await deps.cache.delete(slug);
      }
      return changed;
    },
  };
}
