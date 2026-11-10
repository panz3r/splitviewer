// OG image card: GET /p/:slug/og.png → 1200x630 PNG.
// Data contract identical to the public page (same gating + snapshot); the
// rendered content comes ONLY from the sanitized snapshot (privacy note: the
// unfixed satori SVG-escaping advisory (GHSA-wx4j-mvgx-mqwp) is acceptable
// here because we never embed raw Splitwise data — only masked labels).
/** @jsxImportSource react */
import { Hono } from "hono";
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { OgCard } from "./ui/og-card";
import { resolvePublicView } from "./public";
import type { AppEnv } from "./types";

export const ogImage = new Hono<AppEnv>()

  .get("/p/:slug/og.png", async (c) => {
    const slug = c.req.param("slug");

    // Same gating as the public page: revoked/missing → identical 404s.
    const active = await c.env.DB.prepare(
      "SELECT 1 FROM shares WHERE slug = ?1 AND is_active = 1",
    )
      .bind(slug)
      .first();
    if (!active) return c.text("Not found", 404);

    const view = await resolvePublicView(c.env, slug);
    if (view.status === 502 || !view.snapshot) {
      return c.text("Snapshot unavailable", 502);
    }

    // Required by @cf-wasm/og in workerd (getExecutionContext crashes otherwise).
    cache.setExecutionContext(c.executionCtx);

    const out = await ImageResponse.async(<OgCard snapshot={view.snapshot} />, {
      width: 1200,
      height: 630,
    });

    if (out instanceof Response) {
      out.headers.set("Content-Type", "image/png");
      out.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
      out.headers.set("X-Cache", view.xCache);
      return out;
    }
    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=600",
        "X-Cache": view.xCache,
      },
    });
  });
