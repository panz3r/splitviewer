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
import { readBodyCapped } from "../lib/http";
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

    // Group cover → data URI pre-sized to the card canvas (embedded pixels in
    // the PNG; the URL itself is never rendered). Any failure degrades to the
    // plain charcoal card.
    const coverImage = await coverToDataUri(view.snapshot.coverUrl);

    // Required by @cf-wasm/og in workerd (getExecutionContext crashes otherwise).
    cache.setExecutionContext(c.executionCtx);

    const out = await ImageResponse.async(
      <OgCard snapshot={view.snapshot} coverImage={coverImage} />,
      {
        width: 1200,
        height: 630,
      },
    );

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

/**
 * Converts a snapshot cover URL into a data URI pre-rasterized to the exact OG
 * canvas (1200x630, cover-cropped via SVG preserveAspectRatio="slice").
 * Pre-sizing is required: the bundled satori ignores `objectFit`/`backgroundSize`
 * on embedded images, so the image must arrive at its final geometry.
 * Any failure — or any non-https, non-data source — yields null and the card
 * falls back to the plain charcoal background.
 */
const OG_W = 1200;
const OG_H = 630;
// Upstream cover guards: Splitwise covers are well under this; anything larger
// or slower just falls back to the plain background.
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_FETCH_TIMEOUT_MS = 4_000;

async function coverToDataUri(coverUrl: string | null | undefined): Promise<string | null> {
  try {
    if (!coverUrl) return null;
    let bytes: Uint8Array;
    let type: string;
    if (coverUrl.startsWith("data:")) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(coverUrl);
      if (!match || !match[2]) return null; // only base64 data URIs (our shape)
      if (match[3].length > Math.ceil((MAX_COVER_BYTES * 4) / 3)) return null;
      type = match[1] ?? "image/png";
      bytes = base64ToBytes(match[3]);
    } else {
      if (!coverUrl.startsWith("https://")) return null;
      const res = await fetch(coverUrl, { signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS) });
      if (!res.ok) return null;
      type = res.headers.get("Content-Type") ?? "image/jpeg";
      if (!type.startsWith("image/")) return null;
      const body = await readBodyCapped(res, MAX_COVER_BYTES);
      if (!body) return null;
      bytes = body;
    }
    if (bytes.length === 0) return null;

    // Cover-crop to the OG canvas. The workerd resvg wasm ignores
    // preserveAspectRatio on <image>, so the crop is computed explicitly:
    // parse the natural size, then use an SVG viewBox that extracts the
    // largest 1200x630-aspect region from the source image.
    let natural: { w: number; h: number } | null = null;
    try {
      natural = parseImageSize(bytes);
    } catch {
      natural = null;
    }
    let sized: Uint8Array;
    const embedded = `data:${type};base64,${bytesToBase64(bytes)}`;
    if (natural) {
      const { w, h } = natural;
      const scale = Math.max(OG_W / w, OG_H / h);
      const cropW = OG_W / scale;
      const cropH = OG_H / scale;
      const cx = (w - cropW) / 2;
      const cy = (h - cropH) / 2;
      const wrapper =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}"` +
        ` viewBox="${cx} ${cy} ${cropW} ${cropH}">` +
        `<image href="${embedded}" width="${w}" height="${h}"/>` +
        `</svg>`;
      const { Resvg } = await import("@cf-wasm/resvg/workerd");
      const resvg = await Resvg.async(wrapper, { fitTo: { mode: "width", value: OG_W } });
      sized = resvg.render().asPng();
    } else {
      sized = bytes; // unknown size: hand the original over (contain-like)
    }
    return `data:image/png;base64,${bytesToBase64(sized)}`;
  } catch {
    return null;
  }
}

/** Natural size of a PNG or JPEG from the file header (minimal parsers). */
function parseImageSize(bytes: Uint8Array): { w: number; h: number } {
  // PNG: 8-byte signature, then IHDR with big-endian width/height at 16/20.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return { w: view.getUint32(16), h: view.getUint32(20) };
  }
  // JPEG: scan SOF0/SOF1/SOF2 markers for height/width.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) {
        pos++;
        continue;
      }
      const marker = bytes[pos + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[pos + 5] << 8) | bytes[pos + 6], w: (bytes[pos + 7] << 8) | bytes[pos + 8] };
      }
      const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
      pos += 2 + len;
    }
  }
  throw new Error("unsupported image format");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
