// Visual OG card shared by /p/:slug/og.png and /example-card.png.
// React-only JSX (ImageResponse consumes React elements) — keep this file free
// of hono/jsx imports and of any app state: the card renders ONLY what's in
// the sanitized snapshot.
/** @jsxImportSource react */
import type { SanitizedSnapshot } from "../lib/sanitize";

/**
 * Visual OG card shared by /p/:slug/og.png and /example-card.png.
 * React-only JSX (satori consumes React elements) — keep this file free of
 * hono/jsx imports and of any app state: the card renders ONLY what's in the
 * sanitized snapshot, plus an optional cover image already converted to a
 * data URI by the controller (the raw URL never reaches this file, and no
 * URL is ever rendered into the output).
 */
export function OgCard({
  snapshot,
  coverImage,
}: {
  snapshot: SanitizedSnapshot;
  coverImage?: string | null;
}) {
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
        // Cover as a background layer (satori supports backgroundSize: cover —
        // <img> + objectFit is ignored by satori 0.32). The overlay below dims
        // it; with no cover this is just the plain charcoal card.
        ...(coverImage
          ? {
              backgroundImage: `url("${coverImage}")`,
              // "0 0" is required: the shim's pattern-position math produces
              // NaN for "center" (the image is pre-sized to the exact canvas
              // anyway, so no offset is needed).
              backgroundSize: "cover",
              backgroundPosition: "0 0",
            }
          : {}),
        color: "#f9fafb",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {coverImage ? (
        /* Dimmed black overlay for text readability over the cover. Separate
           conditionals, NOT a JSX fragment: satori walks the raw element tree
           and lays out fragments as zero-sized boxes (children got NaN
           positions inside them). */
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.55)",
          }}
        />
      ) : null}

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
