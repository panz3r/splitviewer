// Generates the committed PNG icon assets from assets/icon.svg using the
// already-installed @cf-wasm/resvg (Node variant). Run after any artwork
// change:  node scripts/generate-icons.mjs
//
// Outputs src/ui/iconAssets.ts (base64 PNGs imported by controllers/assets):
//  - apple-touch-icon 180x180: FULL-BLEED square (no rounded corners /
//    transparency) because iOS applies its own mask and would show black
//    slivers outside the tile's rounded corners otherwise.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@cf-wasm/resvg/node";

const CANONICAL = "https://github.com/panz3r/splitviewer";

const raw = readFileSync("assets/icon.svg", "utf8");

function fullBleedSquare(svg) {
  // Drop the rounded-rect clip so the facets fill the whole canvas.
  return svg
    .replace(/<defs>[\s\S]*?<\/defs>/, "")
    .replace(/ clip-path="url\(#icon-shape\)"/, "")
    .replace(/width="100%" height="100%"/, 'width="180" height="180"');
}

function renderPng(svg, size) {
  return Resvg.async(svg, { fitTo: { mode: "width", value: size } }).then((r) =>
    Buffer.from(r.render().asPng()).toString("base64"),
  );
}

const appleTouch = await renderPng(fullBleedSquare(raw), 180);

const banner = `// GENERATED FILE — do not edit by hand.
// Regenerate with:  node scripts/generate-icons.mjs  (from assets/icon.svg)
// Canonical repo: ${CANONICAL}

/** 180x180 full-bleed square PNG for <link rel="apple-touch-icon"> (iOS). */
export const APPLE_TOUCH_ICON_180_PNG_BASE64 =
  "${appleTouch}";
`;

writeFileSync("src/ui/iconAssets.ts", banner);
console.log("wrote src/ui/iconAssets.ts (apple-touch-icon 180x180,", appleTouch.length, "b64 chars)");
