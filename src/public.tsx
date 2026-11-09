// Public dashboard: GET /p/:slug — the ONLY unauthenticated content surface.
// Security posture: everything rendered comes from the sanitized snapshot;
// revocation beats the cache; missing and revoked slugs render identically.
import { Hono } from "hono";
import { getCache, isFresh, setCache, deleteCache } from "./lib/cache";
import { sanitizeGroup, type SanitizedSnapshot } from "./lib/sanitize";
import { decAccessToken } from "./middleware";
import { fetchGroup, SplitwiseAuthError } from "./lib/splitwise";
import type { AppEnv } from "./types";

interface PublicView {
  status: 200 | 404 | 502;
  xCache: "fresh" | "stale" | "refetched";
  snapshot: SanitizedSnapshot | null;
  asOfSeconds: number | null;
}

// Resolve the view model for a slug. Kept logic-only + injectable fetch so the
// decision tree is testable without network; rendering is separate JSX.
export async function resolvePublicView(
  env: AppEnv["Bindings"],
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicView> {
  const notFound: PublicView = { status: 404, xCache: "fresh", snapshot: null, asOfSeconds: null };

  const share = await env.DB.prepare(
    "SELECT user_id, splitwise_group_id FROM shares WHERE slug = ?1 AND is_active = 1",
  )
    .bind(slug)
    .first<{ user_id: string; splitwise_group_id: string }>();
  if (!share) return notFound;

  const cache = await getCache(env, slug);

  if (cache && isFresh(cache.lastFetchedAt)) {
    return { status: 200, xCache: "fresh", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt };
  }

  // Stale or missing: revalidate from Splitwise using the owner's token.
  try {
    const owner = await env.DB.prepare(
      "SELECT id, splitwise_user_id, encrypted_access_token, token_expiry FROM users WHERE id = ?1",
    )
      .bind(share.user_id)
      .first<{ id: string; splitwise_user_id: string; encrypted_access_token: string; token_expiry: number | null }>();
    if (!owner) return cache ? { status: 200, xCache: "stale", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt } : notFound;

    const token = await decAccessToken(owner, env);
    const rawGroup = await fetchGroup(token, share.splitwise_group_id, fetchImpl);
    const snapshot = sanitizeGroup(slug, rawGroup);
    const now = Math.floor(Date.now() / 1000);
    await setCache(env, slug, snapshot, now);
    return { status: 200, xCache: "refetched", snapshot, asOfSeconds: now };
  } catch (error) {
    // Graceful stale fallback (upstream plan §4) — even for token-expired owners.
    if (cache) {
      return { status: 200, xCache: "stale", snapshot: cache.snapshot, asOfSeconds: cache.lastFetchedAt };
    }
    if (!(error instanceof SplitwiseAuthError)) {
      console.error("public revalidate failed unexpectedly");
    }
    return { status: 502, xCache: "stale", snapshot: null, asOfSeconds: null };
  }
}

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
  .cur { margin-top: 1.2rem; border: 1px solid #e2e2e2; border-radius: 8px; padding: .2rem .9rem .6rem; }
  .badge { font-size: .75rem; padding: .15rem .5rem; border-radius: 999px; background: #eef2f7; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: .45rem 0; border-bottom: 1px solid #f0f0f0; font-variant-numeric: tabular-nums; }
  .amt { text-align: right; font-weight: 600; }
  .flow { color: #555; }
  .arrow { color: #999; padding: 0 .4rem; }
  .foot { color: #777; font-size: .85rem; margin-top: 1.5rem; }
`;

function NotFoundPage({ origin }: { origin: string }) {
  return (
    <html>
      <head><title>Not found — SplitViewer</title></head>
      <body style={STYLE}>
        <h1>Not found</h1>
        <p>This dashboard doesn't exist or has been revoked by its owner.</p>
        <p class="foot"><a href={origin}>What is SplitViewer?</a></p>
      </body>
    </html>
  );
}

function UnavailablePage() {
  return (
    <html>
      <head><title>Snapshot unavailable — SplitViewer</title></head>
      <body style={STYLE}>
        <h1>Snapshot unavailable</h1>
        <p>We couldn't refresh this dashboard right now. Try again soon.</p>
      </body>
    </html>
  );
}

function PublicDashboard({ snapshot, asOfSeconds }: { snapshot: SanitizedSnapshot; asOfSeconds: number | null }) {
  return (
    <html>
      <head>
        <title>SplitViewer — {snapshot.name}</title>
        <meta property="og:title" content={snapshot.name} />
        <meta
          property="og:description"
          content={
            snapshot.currencies.length === 0
              ? "No open debts — everyone is settled up."
              : `${snapshot.currencies.reduce((n, c) => n + c.debts.length, 0)} open settlements · ${
                  snapshot.currencies.map((c) => c.currencyCode).join(", ")
                }`
          }
        />
        <meta property="og:type" content="website" />
        <style>{STYLE}</style>
      </head>
      <body>
        <div class="head">
          <h1>{snapshot.name}</h1>
        </div>

        {snapshot.currencies.length === 0 ? (
          <p>No open debts — everyone is settled up. 🎉</p>
        ) : (
          snapshot.currencies.map((block) => (
            <section class="cur">
              <h2>
                {block.currencyCode} <span class="badge">{block.debts.length}</span>
              </h2>
              <table>
                {block.debts.map((d) => (
                  <tr>
                    <td>
                      {d.from} <span class="arrow">→</span> {d.to}
                    </td>
                    <td class="amt">
                      {d.amount} {block.currencyCode}
                    </td>
                  </tr>
                ))}
              </table>
            </section>
          ))
        )}

        <p class="foot">
          Private details are hidden — only first names and last initials are shown.
          {asOfSeconds ? <> Updated {new Date(asOfSeconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC.</> : null}
        </p>
      </body>
    </html>
  );
}

export const publicView = new Hono<AppEnv>()

  // og:image points here; Phase 5 replaces this 404.
  .get("/p/:slug/og.png", (c) => c.notFound())

  .get("/p/:slug", async (c) => {
    const slug = c.req.param("slug");
    const origin = new URL(c.req.url).origin;

    // Unknown vs revoked must be indistinguishable, and revocation also kills
    // the cache so a revoked share can never "flash" its snapshot again.
    const active = await c.env.DB.prepare(
      "SELECT 1 FROM shares WHERE slug = ?1 AND is_active = 1",
    )
      .bind(slug)
      .first();
    if (!active) {
      await deleteCache(c.env, slug);
      return c.html(<NotFoundPage origin={origin} />, 404);
    }

    const view = await resolvePublicView(c.env, slug);
    c.header("X-Cache", view.xCache);
    const html =
      view.status === 404 ? (
        <NotFoundPage origin={origin} />
      ) : view.status === 502 || !view.snapshot ? (
        <UnavailablePage />
      ) : (
        <PublicDashboard snapshot={view.snapshot} asOfSeconds={view.asOfSeconds} />
      );
    // No-store for 404/502; short browser cache for 200 (crawlers re-fetch, fine).
    c.header("Cache-Control", view.status === 200 ? "max-age=30" : "no-store");
    return c.html(html, view.status);
  });
