// Public dashboard controller: GET /p/:slug — the ONLY unauthenticated content
// surface. Thin HTTP wiring: gating + headers here; the SWR decision tree
// lives in domain/publicViewService and rendering in ui/publicViewPage.
// Security posture: everything rendered comes from the sanitized snapshot;
// revocation beats the cache; missing and revoked slugs render identically.
import { Hono } from "hono";
import { deleteCache } from "../lib/cache";
import { resolvePublicViewForEnv } from "../wiring";
import { D1SharesRepo } from "../repositories/sharesRepo";
import {
  PublicDashboard,
  PublicNotFoundPage,
  PublicUnavailablePage,
} from "../ui/publicViewPage";
import type { AppEnv } from "../types";

export const publicView = new Hono<AppEnv>()

  .get("/p/:slug", async (c) => {
    const slug = c.req.param("slug");
    const origin = new URL(c.req.url).origin;

    // Unknown vs revoked must be indistinguishable, and revocation also kills
    // the cache so a revoked share can never "flash" its snapshot again.
    const active = await new D1SharesRepo(c.env).isActive(slug);
    if (!active) {
      await deleteCache(c.env, slug);
      return c.html(<PublicNotFoundPage origin={origin} />, 404);
    }

    const view = await resolvePublicViewForEnv(c.env, slug);
    c.header("X-Cache", view.xCache);
    const html =
      view.status === 404 ? (
        <PublicNotFoundPage origin={origin} />
      ) : view.status === 502 || !view.snapshot ? (
        <PublicUnavailablePage />
      ) : (
        <PublicDashboard snapshot={view.snapshot} asOfSeconds={view.asOfSeconds} slug={slug} origin={origin} />
      );
    // No-store for 404/502; short browser cache for 200 (crawlers re-fetch, fine).
    c.header("Cache-Control", view.status === 200 ? "max-age=30" : "no-store");
    return c.html(html, view.status);
  });
