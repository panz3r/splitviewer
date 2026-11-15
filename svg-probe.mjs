// Runs the exact og-controller pipeline in workerd via wrangler's unstable_dev? 
// Simpler: reuse the already-seeded data URI by extracting it from /tmp/og-visual-snapshot.json,
// pre-size it with @cf-wasm/resvg/node (same preserveAspectRatio logic), then render with
// satori/standalone (what the workerd shim wraps) and dump the background-image geometry.
import fs from "node:fs";
const snap = JSON.parse(fs.readFileSync("/tmp/og-visual-snapshot.json", "utf8"));
let cover = snap.coverUrl; // original 800x533 data URI

// --- controller pipeline: pre-size to 1200x630 via preserveAspectRatio slice
const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(cover);
const bytes = Buffer.from(m[3], "base64");
const embedded = `data:${m[1] ?? "image/png"};base64,${bytes.toString("base64")}`;
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><image href="${embedded}" width="1200" height="630" preserveAspectRatio="xMidYMid slice"/></svg>`;
const { Resvg } = await import("@cf-wasm/resvg/node");
const r = await Resvg.async(wrapper, { fitTo: { mode: "width", value: 1200 } });
const sizedPng = r.render().asPng();
cover = "data:image/png;base64," + sizedPng.toString("base64");
console.log("pre-sized data uri chars:", cover.length);

// --- render with satori/standalone (the shim's engine) exactly like OgCard
const { default: satori } = await import("satori/standalone");
const yogaWasm = fs.readFileSync("./node_modules/@cf-wasm/satori/dist/lib/yoga.wasm");
const { init } = await import("satori/standalone");
await init(yogaWasm);
const { loadGoogleFont } = await import("@cf-wasm/og/node");

const card = {
  type: "div",
  props: {
    style: {
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: "64px 72px", backgroundColor: "#111827",
      backgroundImage: `url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center",
      color: "#f9fafb", fontFamily: "sans-serif", position: "relative",
    },
    children: [
      { type: "div", props: { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0, 0, 0, 0.55)" } } },
      { type: "div", props: { style: { display: "flex", fontSize: 56, color: "white" }, children: "Local Visual Check" } },
    ],
  },
};
const svg = await satori(card, { width: 1200, height: 630, fonts: [{ name: "sans-serif", data: await loadGoogleFont("Noto Sans"), weight: 400 }] });
fs.writeFileSync("/tmp/og-final-svg.svg", svg);
const img = /<image[^>]*>/g.exec(svg)?.[0] ?? "NO IMAGE";
console.log("image geometry:", img.slice(0, 200));
console.log("svg bytes:", svg.length);
