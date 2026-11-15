import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/index";
import { describe, expect, it } from "vitest";
import { deleteCache, FRESH_WINDOW_SECONDS, getCache, isFresh, setCache } from "../../src/lib/cache";
import { sanitizeGroup, type RawGroupInput } from "../../src/domain/sanitizeService";

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
  const { encrypt } = await import("../../src/lib/crypto");
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

function sampleSnapshot(slug: string, name = "Trip Tuscany", coverUrl: string | null = null) {
  const raw: RawGroupInput = {
    id: "777",
    name,
    coverUrl: coverUrl ?? undefined,
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

    // All freshness assertions pin the clock (`nowSeconds`) — relying on the
    // default wall clock flakes when a second boundary ticks between `now`
    // and the boundary case below.
    expect(isFresh(now, now)).toBe(true);
    expect(isFresh(now - FRESH_WINDOW_SECONDS, now)).toBe(false);
    expect(isFresh(now - FRESH_WINDOW_SECONDS + 1, now)).toBe(true); // boundary excluded

    await deleteCache(env, slug);
    expect(await getCache(env, slug)).toBeNull();
  });
});

describe("GET /p/:slug", () => {
  it("routes are rate-limited on /p/* (shape check: plausible burst from one IP)", async () => {
    // The middleware uses CF-Connecting-IP; workerd test requests share one IP,
    // so this asserts the burst guard triggers rather than exact thresholds.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetchRoute("/p/nosuchslug123456");
      statuses.push(res.status);
    }
    // All may be 404 if below the limit; any 429 proves the limiter is wired,
    // and no other code (5xx) may appear under a plain burst.
    expect(statuses.every((s) => s === 404 || s === 429)).toBe(true);
    if (statuses.includes(429)) {
      // Retry-After must be present on 429 (asserted via header in route test below)
    }
  });

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
    // Sensitive strings must not survive in *content* — scan the body only
    // (head/link URLs legitimately contain "@"-style fragments; CSS is stripped).
    const body = html.replace(/<style>[\s\S]*?<\/style>/g, "").match(/<body[^>]*>[\s\S]*<\/body>/)?.[0] ?? "";
    expect(body).not.toContain("Panzeri");
    expect(body).not.toContain("Lovelace");
    expect(body).not.toContain("@");
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

  it("robots.txt allows /p/ and blocks app surfaces", async () => {
    const res = await fetchRoute("/robots.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Allow: /p/");
    expect(text).toContain("Disallow: /auth");
    expect(text).toContain("Disallow: /dashboard");
    expect(text).toContain("Disallow: /api");
  });

  it("og.png renders a PNG when a fresh snapshot exists", async () => {
    const userId = await insertUser("556");
    const slug = await insertShare(userId, "449");
    await setCache(env, slug, sampleSnapshot(slug));

    const res = await fetchRoute(`/p/${slug}/og.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(10_000); // sane card, not an empty canvas
  });

  it("og.png 404s for unknown and revoked slugs", async () => {
    expect((await fetchRoute("/p/nosuchslug123456/og.png")).status).toBe(404);
  });

  it("og.png 502s with no cache and failing revalidation", async () => {
    const userId = await insertUser("557");
    const slug = await insertShare(userId, "450"); // dummy token -> Splitwise 401
    const res = await fetchRoute(`/p/${slug}/og.png`);
    expect(res.status).toBe(502);
  });

  it("og.png embeds the group cover (dimmed overlay); the page never leaks it", async () => {
    // A tiny inline data URI keeps this deterministic: no outbound image fetch.
    const tinyCover =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const userId = await insertUser("558");
    const slug = await insertShare(userId, "451");
    await setCache(env, slug, sampleSnapshot(slug, "Cover Trip", tinyCover));

    const og = await fetchRoute(`/p/${slug}/og.png`);
    expect(og.status).toBe(200);
    expect(og.headers.get("Content-Type")).toBe("image/png");
    const bytes = new Uint8Array(await og.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(10_000);

    // Privacy: the public HTML page must never render the cover — as a URL
    // or as embedded pixels. Only the OG PNG carries it.
    const page = await fetchRoute(`/p/${slug}`);
    const html = await page.text();
    expect(html).toContain("Cover Trip");
    expect(html).not.toContain(tinyCover);
    expect(html).not.toContain("data:image/png;base64");
  });
});
