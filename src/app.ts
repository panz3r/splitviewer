// App composition root. Builds the Hono app:
// public-route hardening (rate limits) BEFORE the route handlers — Hono
// composes in registration order, so later uses would be dead code.
// All routers live in controllers/; language is derived in middleware/i18n.
import { Hono } from "hono";
import {
  auth,
  homeRoutes,
  dashboard,
  shares,
  publicView,
  ogImage,
  exampleCard,
  supportRoutes,
} from "./controllers";
import { assetsRoutes } from "./controllers/assets";
import { ipRateLimit } from "./lib/ratelimit";
import { langMiddleware } from "./middleware/i18n";
import { securityHeaders } from "./middleware/securityHeaders";
import type { AppEnv } from "./types";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Security headers wrap every response (including 404s and rate-limit hits).
  app.use("*", securityHeaders);

  // Language derivation must run before any handler that reads c.get("lang").
  app.use("*", langMiddleware);

  // Public-route hardening must be registered BEFORE the route handlers
  // (Hono composes in registration order; later uses are dead code).
  app.use("/p/*", ipRateLimit("public-page", 60));
  app.use("/p/*/og.png", ipRateLimit("og-image", 30));

  app.route("/", assetsRoutes);
  app.route("/", auth);
  app.route("/", homeRoutes);
  app.route("/", shares);
  app.route("/", dashboard);
  app.route("/", publicView);
  app.route("/", ogImage);
  app.route("/", exampleCard);
  app.route("/", supportRoutes);

  // Crawler hygiene: public dashboards are the feature; everything else off-limits.
  app.get("/robots.txt", (c) => {
    return c.text(
      [
        "User-agent: *",
        "Allow: /p/",
        "Disallow: /auth",
        "Disallow: /dashboard",
        "Disallow: /api",
        "",
      ].join("\n"),
    );
  });

  return app;
}
