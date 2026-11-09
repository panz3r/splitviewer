import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import { describe, expect, it } from "vitest";
import { deleteCache, FRESH_WINDOW_SECONDS, getCache, isFresh, setCache } from "../src/lib/cache";
import { sanitizeGroup, type RawGroupInput } from "../src/lib/sanitize";

// Note on the revalidate paths: the route's outbound Splitwise call cannot be
// mocked inside workerd, but these tests use a dummy encrypted token, so live
// calls deterministically yield SplitwiseAuthError(401) — the graceful-stale
// branch — regardless of network state. The success path ("refetched") is
// verified live in the browser (plans/phase-4-public-view.md checklist).

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function insertUser(splitwiseId: string): Promise<string> {
  const id = crypto.randomUUID();
  const enc = await encryptForTest("fake-access-token");
  await env.DB.prepare(
    `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
     VALUES (?1, ?2, ?3, ?3)`,
  )
    .bind(id, splitwiseId, enc)
    .run();
  return id;
}

async function encryptForTest(plaintext: string): Promise<string> {
  const key = env.TOKEN_ENCRYPTION_KEY;
  // Reuse the worker's own crypto module through the app import graph.
  const { encrypt } = await import("../src/lib/crypto");
  return encrypt(plaintext, key);
}

async function insertShare(userId: string, groupId: string, revoked = false): Promise<string> {
  const slug = `sl${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
  await env.DB.prepare(
    `INSERT INTO shares (slug, user_id, splitwise_group_id, group_name, is_active)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(slug, userId, groupId, "Test Group", revoked ? 0 : 1)
    .run();
  return slug;
}

function sampleSnapshot(slug: string, name = "Trip Tuscany") {
  const raw: RawGroupInput = {
    id: "777",
    name,
    members: [
      { id: "1", firstName: "Marco", lastName: "Panzeri" },
      { id: "2", firstName: "Ada", lastName: "Lovelace" },
    ],
    simplifiedDebts: [
      { from: "1", to: "2", amount: "20.00", currencyCode: "EUR" },
      { from: "2", to: "1", amount: "5.50", currencyCode: "USD" },
    ],
  };
  return sanitizeGroup(slug, raw);
}

const fetchRoute = async (path: string) => {
  const request = new IncomingRequest(`https://example.com${path}`);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

describe("cache helpers", () => {
  it("round-trips snapshots and reports freshness", async () => {
    const slug = "cacheslug000001";
    const snapshot = sampleSnapshot(slug);
    const now = Math.floor(Date.now() / 1000);
    await setCache(env, slug, snapshot, now);

    const row = await getCache(env, slug);
    expect(row?.snapshot).toEqual(snapshot);
    expect(row?.lastFetchedAt).toBe(now);

    expect(isFresh(now)).toBe(true);
    expect(isFresh(now - FRESH_WINDOW_SECONDS)).toBe(false);
    expect(isFresh(now - FRESH_WINDOW_SECONDS + 1)).toBe(true); // boundary excluded

    await deleteCache(env, slug);
    expect(await getCache(env, slug)).toBeNull();
  });
});

describe("GET /p/:slug", () => {
  it("404s unknown slugs", async () => {
    const res = await fetchRoute("/p/nosuchslug123456");
    expect(res.status).toBe(404);
  });

  it("404s revoked slugs identically and drops their cache", async () => {
    const userId = await insertUser("551");
    const slug = await insertShare(userId, "333", true);
    await setCache(env, slug, sampleSnapshot(slug)); // warm cache must not matter

    const res = await fetchRoute(`/p/${slug}`);
    expect(res.status).toBe(404);
    expect(await getCache(env, slug)).toBeNull(); // cache dropped on revoke
    expect(await (await fetchRoute("/p/nosuchslug123456")).text()).toBe(await res.text());
  });

  it("renders the fresh cache without calling Splitwise", async () => {
    const userId = await insertUser("552");
    const slug = await insertShare(userId, "444");
    await setCache(env, slug, sampleSnapshot(slug));

    const res = await fetchRoute(`/p/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("fresh");
    const html = await res.text();
    expect(html).toContain("Trip Tuscany");
    expect(html).toContain("Marco P.");
    expect(html).toContain("20.00 EUR");
    expect(html).not.toContain("Panzeri");
    expect(html).not.toContain("Lovelace");
    expect(html).not.toContain("@");
  });

  it("serves stale cache when revalidation fails (401 token)", async () => {
    const userId = await insertUser("553");
    const slug = await insertShare(userId, "445");
    const snapshot = sampleSnapshot(slug, "Stale Trip");
    await setCache(env, slug, snapshot, Math.floor(Date.now() / 1000) - FRESH_WINDOW_SECONDS - 1);

    const res = await fetchRoute(`/p/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("stale");
    expect(await res.text()).toContain("Stale Trip");
  });

  it("502s when there is no cache and revalidation fails", async () => {
    const userId = await insertUser("554");
    const slug = await insertShare(userId, "446");
    const res = await fetchRoute(`/p/${slug}`);
    expect(res.status).toBe(502);
  });

  it("og.png stays 404 until Phase 5", async () => {
    const userId = await insertUser("555");
    const slug = await insertShare(userId, "448");
    const res = await fetchRoute(`/p/${slug}/og.png`);
    expect(res.status).toBe(404);
  });
});
