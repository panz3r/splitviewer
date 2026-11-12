import { describe, expect, it } from "vitest";
import { createShareService, ShareWriteError, SLUG_LENGTH } from "../../src/domain/shareService";
import { makeSharesRepo, makeCacheRepo, InMemorySharesRepo, InMemoryCacheRepo } from "../fakes/repos";
import { sanitizeGroup, type RawGroupInput } from "../../src/domain/sanitizeService";

// Unit tests for the share lifecycle service against in-memory repositories.

let counter = 0;
const sequentialSlugs = () => `slug${String(++counter).padStart(12, "0")}`;

function snapshot(slug: string) {
  const raw: RawGroupInput = {
    id: "1",
    name: "Flat",
    members: [{ id: "m1", firstName: "Ada", lastName: "Lovelace" }],
    simplifiedDebts: [{ from: "m1", to: "m1", amount: "0", currencyCode: "EUR" }],
  };
  return sanitizeGroup(slug, raw);
}

describe("shareService.create", () => {
  it("creates a share and returns the generated slug", async () => {
    const shares = makeSharesRepo();
    const svc = createShareService({
      shares,
      cache: makeCacheRepo(),
      generateSlug: sequentialSlugs,
    });
    const slug = await svc.create("u1", "g1", "Flat");
    expect(slug).toMatch(new RegExp(`^slug0{0,2}1$|^slug\\d{12}$`));
    expect(slug).toHaveLength(SLUG_LENGTH);
    const rows = await shares.byUser("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.splitwise_group_id).toBe("g1");
    expect(rows[0]?.is_active).toBe(1);
  });

  it("rotates the slug on re-create (single row per group)", async () => {
    const shares = makeSharesRepo();
    const svc = createShareService({ shares, cache: makeCacheRepo(), generateSlug: sequentialSlugs });
    const first = await svc.create("u1", "g1", "Flat");
    const second = await svc.create("u1", "g1", "Flat");
    expect(second).not.toBe(first);
    expect(await shares.byUser("u1")).toHaveLength(1);
  });

  it("retries on slug collision and succeeds", async () => {
    const shares = makeSharesRepo();
    // Pre-seed a share whose slug collides with the first generated slug.
    await shares.createOrRotate({ userId: "other", splitwiseGroupId: "gx", groupName: "X", slug: "slug000000000001" });
    counter = 0;
    let calls = 0;
    const svc = createShareService({
      shares,
      cache: makeCacheRepo(),
      generateSlug: () => {
        calls++;
        return sequentialSlugs();
      },
    });
    const slug = await svc.create("u1", "g1", "Flat");
    expect(calls).toBe(2); // first collided, second succeeded
    expect(slug).toBe("slug000000000002");
  });

  it("throws ShareWriteError after 3 failed attempts", async () => {
    counter = 0;
    const failing = {
      activeBySlug: async () => null,
      isActive: async () => false,
      byUser: async () => [],
      createOrRotate: async () => {
        throw new Error("UNIQUE constraint failed: shares.slug");
      },
      deactivate: async () => false,
    } as unknown as InMemorySharesRepo;
    const svc = createShareService({
      shares: failing,
      cache: makeCacheRepo(),
      generateSlug: sequentialSlugs,
      onWriteError: () => {}, // keep test output clean
    });
    await expect(svc.create("u1", "g1", "Flat")).rejects.toBeInstanceOf(ShareWriteError);
  });
});

describe("shareService.revoke", () => {
  it("deactivates own share and drops the cache (instant revocation)", async () => {
    const shares = makeSharesRepo();
    const cache = makeCacheRepo();
    const svc = createShareService({ shares, cache, generateSlug: sequentialSlugs });
    const slug = await svc.create("u1", "g1", "Flat");
    await cache.set(slug, snapshot(slug), 1);

    const changed = await svc.revoke("u1", slug);
    expect(changed).toBe(true);
    expect(await shares.isActive(slug)).toBe(false);
    expect(await cache.get(slug)).toBeNull();
  });

  it("returns false for a slug the user does not own (and never touches the cache)", async () => {
    const shares = makeSharesRepo();
    const cache = makeCacheRepo();
    const svc = createShareService({ shares, cache, generateSlug: sequentialSlugs });
    const slug = await svc.create("owner", "g1", "Flat");
    await cache.set(slug, snapshot(slug), 1);

    const changed = await svc.revoke("attacker", slug);
    expect(changed).toBe(false);
    expect(await cache.get(slug)).toEqual({ snapshot: snapshot(slug), lastFetchedAt: 1 });
  });
});
