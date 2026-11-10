// Public dashboard: GET /p/:slug — the ONLY unauthenticated content surface.
// Security posture: everything rendered comes from the sanitized snapshot;
// revocation beats the cache; missing and revoked slugs render identically.
import { Hono } from "hono";
import { getCache, isFresh, setCache, deleteCache } from "./lib/cache";
import { sanitizeGroup, type SanitizedSnapshot } from "./lib/sanitize";
import { decAccessToken } from "./middleware";
import { fetchGroup, SplitwiseAuthError, type RawGroup } from "./lib/splitwise";
import { refreshUserToken } from "./lib/users";
import { PageShell } from "./ui/components";
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

    let token = await decAccessToken(owner, env);
    const rawGroup = await (async (): Promise<RawGroup> => {
      try {
        return await fetchGroup(token, share.splitwise_group_id, fetchImpl);
      } catch (error) {
        // 401 → one automated token-refresh attempt then a single retry
        // (upstream Phase 6). If refresh is impossible (no refresh token stored —
        // the observed Splitwise behavior), fall through to the stale path below.
        if (!(error instanceof SplitwiseAuthError) || error.status !== 401) throw error;

        const refreshed = await refreshUserToken(env, owner, fetchImpl);
        if (!refreshed) throw error;
        const freshOwner = await env.DB.prepare(
          "SELECT id, splitwise_user_id, encrypted_access_token, token_expiry FROM users WHERE id = ?1",
        )
          .bind(owner.id)
          .first<{ id: string; splitwise_user_id: string; encrypted_access_token: string; token_expiry: number | null }>();
        if (!freshOwner) throw error;
        token = await decAccessToken(freshOwner, env);
        return await fetchGroup(token, share.splitwise_group_id, fetchImpl);
      }
    })();

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
  .cur { margin-top: 1.2rem; border: 1px solid var(--line); border-radius: var(--radius-card); padding: .2rem 1.1rem .8rem; background: var(--paper); box-shadow: var(--shadow); }
  .cur h2 { display: flex; align-items: center; gap: .5rem; margin: .2rem 0 .3rem; font-size: 1.05rem; }
  table.ledger { width: 100%; border-collapse: collapse; }
  .ledger td { padding: .6rem 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  .ledger tr:last-child td { border-bottom: none; }
  .amt { text-align: right; font-weight: 600; }
  .arrow { color: var(--muted); padding: 0 .4rem; }
  .foot { color: var(--muted); font-size: .85rem; margin-top: 1.5rem; }
`;

function NotFoundPage({ origin }: { origin: string }) {
  return (
    <PageShell title="Not found — SplitViewer" hideNav>
      <div class="card">
        <h1 style="margin-top: 0;">Not found</h1>
        <p>This dashboard doesn't exist or has been revoked by its owner.</p>
        <a class="btn" href={origin}>What is SplitViewer?</a>
      </div>
    </PageShell>
  );
}

function UnavailablePage() {
  return (
    <PageShell title="Snapshot unavailable — SplitViewer" hideNav>
      <div class="card">
        <h1 style="margin-top: 0;">Snapshot unavailable</h1>
        <p>We couldn't refresh this dashboard right now. Try again soon.</p>
      </div>
    </PageShell>
  );
}

function PublicDashboard({ snapshot, asOfSeconds, slug, origin }: { snapshot: SanitizedSnapshot; asOfSeconds: number | null; slug: string; origin: string }) {
  const ogDescription =
    snapshot.currencies.length === 0
      ? "No open debts — everyone is settled up."
      : `${snapshot.currencies.reduce((n, c) => n + c.debts.length, 0)} open settlements · ${snapshot.currencies
          .map((c) => c.currencyCode)
          .join(", ")}`;
  return (
    <PageShell
      title={`SplitViewer — ${snapshot.name}`}
      description={ogDescription}
      head={
        <>
          <meta property="og:title" content={snapshot.name} />
          <meta property="og:description" content={ogDescription} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={`${origin}/p/${slug}`} />
          <meta property="og:image" content={`${origin}/p/${slug}/og.png`} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta name="twitter:card" content="summary_large_image" />
        </>
      }
    >
      <style>{STYLE}</style>

      <h1 class="pub-title">{snapshot.name}</h1>
      <p class="pub-sub">
        Open debts for this group
        {asOfSeconds ? (
          <>
            {" "}· snapshot of{" "}
            <strong>{new Date(asOfSeconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</strong>
          </>
        ) : null}
      </p>

      {snapshot.currencies.length === 0 ? (
        <div class="card">
          <p style="margin: 0; font-size: 1.05em;">
            Everyone is settled up — nothing owed right now. 🎉
          </p>
        </div>
      ) : (
        snapshot.currencies.map((block) => (
          <section class="card cur" aria-label={`Debts in ${block.currencyCode}`}>
            <h2>
              {block.currencyCode} <span class="badge">{block.debts.length}</span>
            </h2>
            <table class="ledger">
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
        This page is generated by <a href={origin}>SplitViewer</a> from the organizer's
        latest balance snapshot.
      </p>
    </PageShell>
  );
}

export const publicView = new Hono<AppEnv>()

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
        <PublicDashboard snapshot={view.snapshot} asOfSeconds={view.asOfSeconds} slug={slug} origin={origin} />
      );
    // No-store for 404/502; short browser cache for 200 (crawlers re-fetch, fine).
    c.header("Cache-Control", view.status === 200 ? "max-age=30" : "no-store");
    return c.html(html, view.status);
  });
