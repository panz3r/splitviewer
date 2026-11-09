// OG image card: GET /p/:slug/og.png → 1200x630 PNG.
// Data contract identical to the public page (same gating + snapshot); the
// rendered content comes ONLY from the sanitized snapshot (privacy note: the
// unfixed satori SVG-escaping advisory (GHSA-wx4j-mvgx-mqwp) is acceptable
// here because we never embed raw Splitwise data — only masked labels).
/** @jsxImportSource react */
import { Hono } from "hono";
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { resolvePublicView } from "./public";
import type { AppEnv } from "./types";
import type { SanitizedSnapshot } from "./lib/sanitize";

function Card({ snapshot }: { snapshot: SanitizedSnapshot }) {
  const totalDebts = snapshot.currencies.reduce((n, c) => n + c.debts.length, 0);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: "#111827",
        color: "#f9fafb",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ display: "flex", fontSize: "22px", color: "#9ca3af", letterSpacing: "1px" }}>
            SPLITVIEWER
          </span>
        </div>
        <div style={{ display: "flex", fontSize: "56px", fontWeight: 700, marginTop: "18px" }}>
          {snapshot.name || "Splitwise group"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "12px" }}>
        {totalDebts === 0 ? (
          <div style={{ display: "flex", fontSize: "34px", color: "#a7f3d0" }}>
            All settled up 🎉
          </div>
        ) : (
          snapshot.currencies.flatMap((block) =>
            block.debts.slice(0, 3).map((d) => (
              <div style={{ display: "flex", fontSize: "34px", color: "#d1d5db" }}>
                <span style={{ display: "flex" }}>
                  {d.from} → {d.to}
                </span>
                <span style={{ display: "flex", marginLeft: "auto", fontWeight: 600 }}>
                  {d.amount} {block.currencyCode}
                </span>
              </div>
            )),
          )
        )}
        {totalDebts > 3 ? (
          <div style={{ display: "flex", fontSize: "24px", color: "#9ca3af" }}>
            + {totalDebts - 3} more…
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "24px", color: "#6b7280" }}>
        <span>Private debt dashboard</span>
        <span>
          {snapshot.updatedAt ? new Date(snapshot.updatedAt).toISOString().slice(0, 10) : null}
        </span>
      </div>
    </div>
  );
}

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

    const out = await ImageResponse.async(<Card snapshot={view.snapshot} />, {
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
