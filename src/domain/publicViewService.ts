// Public-view service (domain layer): the SWR decision tree behind
// GET /p/:slug and /p/:slug/og.png. Framework-agnostic — all I/O arrives via
// injected deps, so the branching (fresh / stale / refetched / 404 / 502) is
// unit-testable with in-memory repositories and a fake Splitwise client.
//
// Behavior contract (unchanged):
// - revocation beats the cache (caller deletes cache on revoke; gating checks
//   active shares only)
// - missing and revoked slugs resolve identically (404)
// - stale snapshot served when revalidation fails; 502 only with no cache
// - 401 → one automated token-refresh attempt, then a single retry
import { isFresh } from "../repositories/cacheRepo";
import { sanitizeGroup } from "./sanitizeService";
import type { PublicView } from "./types";
import type { SharesRepo } from "../repositories/sharesRepo";
import type { UsersRepo } from "../repositories/usersRepo";
import type { CacheRepo } from "../repositories/cacheRepo";
import type { SplitwiseClient } from "../lib/splitwise";

export interface PublicViewDeps {
  shares: Pick<SharesRepo, "activeBySlug">;
  cache: CacheRepo;
  users: Pick<UsersRepo, "byId">;
  /** Decrypts a stored (ciphertext) access token. */
  decryptToken(encryptedAccessToken: string): Promise<string>;
  /** Single-flighted refresh grant for the owner; true when tokens rotated. */
  refresh(userId: string): Promise<boolean>;
  splitwise: Pick<SplitwiseClient, "fetchGroup">;
  nowSeconds?(): number;
  onUnexpectedError?(error: unknown): void;
}

export function createPublicViewService(deps: PublicViewDeps) {
  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  // Deliberately terse log (no error object): outbound failures may carry
  // token-adjacent payloads we never want in logs.
  const onUnexpectedError = deps.onUnexpectedError ?? (() => {
    console.error("public revalidate failed unexpectedly");
  });

  return async function resolvePublicView(slug: string): Promise<PublicView> {
    const notFound: PublicView = { status: 404, xCache: "fresh", snapshot: null, asOfSeconds: null };

    const share = await deps.shares.activeBySlug(slug);
    if (!share) return notFound;

    const cache = await deps.cache.get(slug);

    if (cache && isFresh(cache.lastFetchedAt, nowSeconds())) {
      return { status: 200, xCache: "fresh", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt };
    }

    // Stale or missing: revalidate from Splitwise using the owner's token.
    try {
      const owner = await deps.users.byId(share.userId);
      if (!owner) {
        return cache
          ? { status: 200, xCache: "stale", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt }
          : notFound;
      }

      let token = await deps.decryptToken(owner.encrypted_access_token);
      const rawGroup = await (async () => {
        try {
          return await deps.splitwise.fetchGroup(token, share.groupId);
        } catch (error) {
          // 401 → one automated token-refresh attempt then a single retry
          // If refresh is impossible (no refresh token stored —
          // the observed Splitwise behavior), fall through to the stale path below.
          if (!(error instanceof Error) || error.name !== "SplitwiseAuthError") throw error;
          const authError = error as { status?: number };
          if (authError.status !== 401) throw error;

          const refreshed = await deps.refresh(owner.id);
          if (!refreshed) throw error;
          const freshOwner = await deps.users.byId(owner.id);
          if (!freshOwner) throw error;
          token = await deps.decryptToken(freshOwner.encrypted_access_token);
          return await deps.splitwise.fetchGroup(token, share.groupId);
        }
      })();

      const snapshot = sanitizeGroup(slug, rawGroup);
      const now = nowSeconds();
      await deps.cache.set(slug, snapshot, now);
      return { status: 200, xCache: "refetched", snapshot, asOfSeconds: now };
    } catch (error) {
      // Graceful stale fallback — even for token-expired owners.
      if (cache) {
        return { status: 200, xCache: "stale", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt };
      }
      if (!isSplitwiseAuthError(error)) {
        onUnexpectedError(error);
      }
      return { status: 502, xCache: "stale", snapshot: null, asOfSeconds: null };
    }
  };
}

/** Local type guard that avoids importing SplitwiseAuthError into this decision tree. */
function isSplitwiseAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === "SplitwiseAuthError";
}
