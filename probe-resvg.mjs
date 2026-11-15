import fs from "node:fs";
const svg = fs.readFileSync("/tmp/probe-standalone.svg", "utf8");
const { Resvg } = await import("@cf-wasm/resvg/node");
const r = await Resvg.async(svg, { fitTo: { mode: "width", value: 400 } });
const png = Buffer.from(r.render().asPng());
fs.writeFileSync("/tmp/probe-resvg-node.png", png);
console.log("node resvg png bytes:", png.length);

// wasm variant (what workerd uses)
const wasm = fs.readFileSync("./node_modules/@cf-wasm/resvg/dist/lib/resvg.wasm");
const { initResvgWasm, ResvgWasm } = await import("@cf-wasm/resvg/workerd").catch(() => ({ }));
console.log("workerd variant importable:", Boolean(initResvgWasm));
