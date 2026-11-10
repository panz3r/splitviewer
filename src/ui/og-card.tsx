// Visual OG card shared by /p/:slug/og.png and /example-card.png.
// React-only JSX (ImageResponse consumes React elements) — keep this file free
// of hono/jsx imports and of any app state: the card renders ONLY what's in
// the sanitized snapshot.
/** @jsxImportSource react */
import type { SanitizedSnapshot } from "../lib/sanitize";

export function OgCard({ snapshot }: { snapshot: SanitizedSnapshot }) {
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
