// OG image card: GET /p/:slug/og.png → 1200x630 PNG.
// Data contract identical to the public page (same gating + snapshot); the
// rendered content comes ONLY from the sanitized snapshot.
//
// Security note on satori (GHSA-wx4j-mvgx-mqwp / CVE-2026-94545, improper SVG
// escaping — affects satori < 0.33.5): ACCEPTED risk, deliberately. Our
// exposure is minimal because the satori output is rasterized server-side to
// PNG via resvg (no SVG is ever served, resvg executes nothing) and inputs are
// masked labels. Upstream is stuck: @cf-wasm/og@0.5.0 → @cf-wasm/satori@0.4.2
// hard-pins satori@0.32.0, and satori ≥ 0.33 uses a new harfbuzz-shaping
// architecture that crashes with the wrapper (npm `overrides` to 0.33.5 breaks
// OG rendering). Tracked as Dependabot alert #1; revisit if @cf-wasm/og bumps
// satori, or before ever serving satori SVG directly.
/** @jsxImportSource react */
import { Hono } from "hono";
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { OgCard } from "../ui/og-card";
import { resolvePublicViewForEnv } from "../wiring";
import { D1SharesRepo } from "../repositories/sharesRepo";
import type { AppEnv } from "../types";

export const ogImage = new Hono<AppEnv>()

  .get("/p/:slug/og.png", async (c) => {
    const slug = c.req.param("slug");

    // Same gating as the public page: revoked/missing → identical 404s.
    const active = await new D1SharesRepo(c.env).isActive(slug);
    if (!active) return c.text("Not found", 404);

    const view = await resolvePublicViewForEnv(c.env, slug);
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
