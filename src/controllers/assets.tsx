// Static assets: /icon.svg (favicon), /favicon.ico (redirect shim for
// anything hardcoding the legacy path), /apple-touch-icon.png (iOS home
// screen), and the dashboard share script (/share.js — external because the
// CSP blocks inline scripts).
import { Hono } from "hono";
import { ICON_SVG } from "../ui/icon";
import { APPLE_TOUCH_ICON_180_PNG_BASE64 } from "../ui/iconAssets";
import { SHARE_SCRIPT, SHARE_SCRIPT_PATH } from "../ui/shareScript";
import type { AppEnv } from "../types";

/** atob() returns a latin-1 string; body() would re-encode it as UTF-8 and
 *  corrupt bytes >127 — convert to raw bytes explicitly. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export const assetsRoutes = new Hono<AppEnv>()

  .get("/icon.svg", (c) =>
    c.body(ICON_SVG, 200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    }))

  // Browsers/crawlers that request /favicon.ico without reading <link rel="icon">
  // get bounced to the SVG (modern browsers understand SVG favicons natively).
  .get("/favicon.ico", (c) =>
    c.redirect("/icon.svg", 302))

  .get(SHARE_SCRIPT_PATH, (c) =>
    c.body(SHARE_SCRIPT, 200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    }))

  .get("/apple-touch-icon.png", (c) =>
    new Response(base64ToBytes(APPLE_TOUCH_ICON_180_PNG_BASE64), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800",
      },
    }));
