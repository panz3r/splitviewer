// Security response headers for every route (CSP, HSTS, frame/sniffing/referrer
// policies) via hono/secure-headers.
//
// CSP notes:
// - Scripts: same-origin files only — no inline scripts (the dashboard share
//   script is served from /share.js).
// - Styles: 'unsafe-inline' is needed for the <style> blocks and style=""
//   attributes the SSR views emit.
// - Fonts: self-hosted under /fonts (no third-party font CDN).
// - Images: Splitwise avatars/covers are remote https URLs.
// - Referrer-Policy: no-referrer, so /p/<slug> URLs never leak to third parties.
import { secureHeaders } from "hono/secure-headers";

export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    objectSrc: ["'none'"],
  },
  xFrameOptions: "DENY",
  referrerPolicy: "no-referrer",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  // Link-preview images (og.png, icons) must stay embeddable cross-origin.
  crossOriginResourcePolicy: false,
});
