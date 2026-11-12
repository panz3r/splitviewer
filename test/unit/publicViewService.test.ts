import { describe, expect, it } from "vitest";
import { createPublicViewService, type PublicViewDeps } from "../../src/domain/publicViewService";
import { makeSharesRepo, makeCacheRepo, makeUsersRepo, InMemoryCacheRepo } from "../fakes/repos";
import { makeSplitwiseClient, FakeSplitwiseAuthError } from "../fakes/splitwise";
import { sanitizeGroup, type RawGroupInput } from "../../src/domain/sanitizeService";
import type { UsersRepo } from "../../src/repositories/usersRepo";

// Unit tests for the public-view SWR decision tree — the branch logic behind
// GET /p/:slug, previously locked inside the controller, now testable with
// in-memory repos + a fake Splitwise client.

const RAW: RawGroupInput = {
  id: "777",
  name: "Trip Tuscany",
  members: [
    { id: "1", firstName: "Marco", lastName: "Panzeri" },
    { id: "2", firstName: "Ada", lastName: "Lovelace" },
  ],
  simplifiedDebts: [
    { from: "1", to: "2", amount: "20.00", currencyCode: "EUR" },
    { from: "2", to: "1", amount: "5.50", currencyCode: "USD" },
  ],
};

function makeDeps(overrides: Partial<PublicViewDeps> = {}): PublicViewDeps & {
  cache: InMemoryCacheRepo;
  splitwise: ReturnType<typeof makeSplitwiseClient>;
  users: UsersRepo;
} {
  const cache = makeCacheRepo();
  const splitwise = makeSplitwiseClient({ group: RAW });
  const users = makeUsersRepo();
  const base: PublicViewDeps & { cache: InMemoryCacheRepo; splitwise: ReturnType<typeof makeSplitwiseClient>; users: UsersRepo } = {
    shares: makeSharesRepo(),
    cache,
    users,
    decryptToken: async (encrypted) => `dec:${encrypted}`,
    refresh: async () => false,
    splitwise,
    nowSeconds: () => 1_000_000,
    onUnexpectedError: () => {},
  };
  // Overridable after the base so tests can swap any dep (incl. the fakes).
  return { ...base, ...overrides } as PublicViewDeps & {
    cache: InMemoryCacheRepo;
    splitwise: ReturnType<typeof makeSplitwiseClient>;
    users: UsersRepo;
  };
}

async function seed(
  deps: ReturnType<typeof makeDeps>,
  opts: { slug: string; userId?: string; groupId?: string; cachedAt?: number } = {},
) {
  const slug = opts.slug ?? "sluggish12345678";
  const userId = opts.userId ?? "u1";
  (deps.shares as ReturnType<typeof makeSharesRepo>).rows.push({
    slug,
    userId,
    splitwiseGroupId: opts.groupId ?? "777",
    groupName: "Trip Tuscany",
    isActive: true,
  });
  deps.users.rows.set(userId, {
    id: userId,
    splitwiseUserId: "sw-1",
    accessToken: "enc-access",
    refreshToken: "enc-refresh",
    expiresAt: null,
  });
  if (opts.cachedAt !== undefined) {
    await deps.cache.set(slug, sanitizeGroup(slug, RAW), opts.cachedAt);
  }
  return slug;
}

describe("publicViewService", () => {
  it("404s unknown slugs without touching Splitwise", async () => {
    const deps = makeDeps();
    const view = await createPublicViewService(deps)("nosuchslug123456");
    expect(view).toEqual({ status: 404, xCache: "fresh", snapshot: null, asOfSeconds: null });
    expect(deps.splitwise.calls).toHaveLength(0);
  });

  it("serves a fresh cache without calling Splitwise", async () => {
    const deps = makeDeps();
    const slug = await seed(deps, { cachedAt: 1_000_000 }); // exactly "now" → fresh
    const view = await createPublicViewService(deps)(slug);
    expect(view.status).toBe(200);
    expect(view.xCache).toBe("fresh");
    expect(view.snapshot?.name).toBe("Trip Tuscany");
    expect(deps.splitwise.calls).toHaveLength(0);
  });

  it("refetches stale caches, stores the new snapshot, and reports 'refetched'", async () => {
    const deps = makeDeps();
    const slug = await seed(deps, { cachedAt: 1_000_000 - 7 * 60 - 1 }); // outside the fresh window
    const view = await createPublicViewService(deps)(slug);
    expect(view.status).toBe(200);
    expect(view.xCache).toBe("refetched");
    expect(view.asOfSeconds).toBe(1_000_000);
    const stored = await deps.cache.get(slug);
    expect(stored?.snapshot.name).toBe("Trip Tuscany");
    expect(deps.splitwise.calls.some((c) => c.op === "fetchGroup")).toBe(true);
  });

  it("falls back to the stale snapshot when revalidation fails", async () => {
    const deps = makeDeps({
      splitwise: makeSplitwiseClient({ group: new FakeSplitwiseAuthError(401) }),
    });
    const slug = await seed(deps, { cachedAt: 0 }); // very stale
    const view = await createPublicViewService(deps)(slug);
    expect(view.status).toBe(200);
    expect(view.xCache).toBe("stale");
    expect(view.snapshot?.name).toBe("Trip Tuscany");
  });

  it("502s when there is no cache and revalidation fails", async () => {
    const deps = makeDeps({
      splitwise: makeSplitwiseClient({ group: new FakeSplitwiseAuthError(401) }),
    });
    const slug = await seed(deps);
    const view = await createPublicViewService(deps)(slug);
    expect(view.status).toBe(502);
    expect(view.snapshot).toBeNull();
  });

  it("treats a missing owner as stale-with-cache or 404-without", async () => {
    const deps = makeDeps();
    const slug = await seed(deps, { cachedAt: 0 });
    deps.users.rows.clear(); // owner vanished
    const stale = await createPublicViewService(deps)(slug);
    expect(stale.xCache).toBe("stale");

    const deps2 = makeDeps();
    const slug2 = await seed(deps2);
    deps2.users.rows.clear();
    const missing = await createPublicViewService(deps2)(slug2);
    expect(missing.status).toBe(404);
  });

  it("on 401, attempts one token refresh then retries the fetch", async () => {
    let fetchCalls = 0;
    const splitwise = makeSplitwiseClient();
    splitwise.fetchGroup = async () => {
      fetchCalls++;
      if (fetchCalls === 1) throw new FakeSplitwiseAuthError(401);
      return RAW;
    };
    let refreshCalls = 0;
    const deps = makeDeps({
      splitwise,
      refresh: async () => {
        refreshCalls++;
        return true;
      },
    });
    const slug = await seed(deps, { cachedAt: 0 });

    const view = await createPublicViewService(deps)(slug);
    expect(refreshCalls).toBe(1);
    expect(fetchCalls).toBe(2);
    expect(view.xCache).toBe("refetched");
  });

  it("does not refresh when the 401 persists and no cache exists → 502", async () => {
    const deps = makeDeps({
      splitwise: makeSplitwiseClient({ group: new FakeSplitwiseAuthError(401) }),
      refresh: async () => true, // refresh "succeeds" but fetch still 401s
    });
    const slug = await seed(deps);
    const view = await createPublicViewService(deps)(slug);
    expect(view.status).toBe(502);
  });

  it("privacy: the resolved snapshot never contains surnames or emails", async () => {
    const deps = makeDeps();
    const slug = await seed(deps, { cachedAt: 1_000_000 });
    const view = await createPublicViewService(deps)(slug);
    const json = JSON.stringify(view.snapshot);
    expect(json).not.toContain("Panzeri");
    expect(json).not.toContain("Lovelace");
    expect(json).not.toContain("@");
  });

  it("multi-currency: debts stay grouped per currency, never blended", async () => {
    const deps = makeDeps();
    const slug = await seed(deps, { cachedAt: 1_000_000 });
    const view = await createPublicViewService(deps)(slug);
    expect(view.snapshot?.currencies.map((c) => c.currencyCode)).toEqual(["EUR", "USD"]);
  });
});
