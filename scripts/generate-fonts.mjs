// Generates src/ui/fontAssets.ts from the self-hosted WOFF2 files in
// assets/fonts/ (latin subsets from @fontsource, SIL OFL 1.1 — licenses sit
// next to the files). Run after changing any font file:
//   node scripts/generate-fonts.mjs
//
// Fonts are served by the Worker itself (/fonts/*) so public pages make no
// third-party requests (no visitor IPs leak to a font CDN).
import { readFileSync, writeFileSync } from "node:fs";

const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

const FACES = [
  { family: "Montserrat", weight: "600 800", file: "montserrat-latin-wght-normal.woff2" },
  { family: "Lato", weight: "400", file: "lato-latin-400-normal.woff2" },
  { family: "Lato", weight: "700", file: "lato-latin-700-normal.woff2" },
];

const files = FACES.map(({ file }) => {
  const b64 = readFileSync(`assets/fonts/${file}`).toString("base64");
  return `  "${file}":\n    "${b64}",`;
}).join("\n");

const css = FACES.map(
  ({ family, weight, file }) =>
    `@font-face{font-family:${family};font-style:normal;font-display:swap;font-weight:${weight};` +
    `src:url(/fonts/${file}) format("woff2");unicode-range:${LATIN_RANGE}}`,
).join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with:  node scripts/generate-fonts.mjs  (from assets/fonts/)

/** Self-hosted WOFF2 fonts (base64), keyed by the file name served at /fonts/<name>. */
export const FONT_FILES: Record<string, string> = {
${files}
};

/** @font-face rules for the fonts above (prepended to the app stylesheet). */
export const FONT_FACE_CSS = ${JSON.stringify(css)};

/** Fonts worth preloading on every page (body text + headings). */
export const PRELOAD_FONTS = ["/fonts/lato-latin-400-normal.woff2", "/fonts/montserrat-latin-wght-normal.woff2"];
`;

writeFileSync("src/ui/fontAssets.ts", out);
console.log("wrote src/ui/fontAssets.ts (", FACES.length, "faces )");
