// Homepage controller: landing at / and /it. Thin HTTP wiring — the view
// component (ui/homePage) holds the JSX; language comes from the i18n
// middleware. Authenticated users never see the landing page again.
import { Hono } from "hono";
import { getSessionUserId } from "../middleware/session";
import { PageShell } from "../ui/components";
import { homePage } from "../ui/homePage";
import type { AppEnv } from "../types";

export const homeRoutes = new Hono<AppEnv>()

  .get("/", async (c) => {
    const userId = await getSessionUserId(c);
    if (userId) {
      // Authenticated users should never see the landing page again.
      return c.redirect("/dashboard", 302);
    }
    return c.html(<PageShell {...homePage({ lang: "en", origin: new URL(c.req.url).origin })} />);
  })

  .get("/it", async (c) => {
    const userId = await getSessionUserId(c);
    if (userId) {
      // Language-aware: from the IT homepage, logged-in users land on the IT
      // dashboard (logo click from /it/dashboard must round-trip).
      return c.redirect("/it/dashboard", 302);
    }
    return c.html(<PageShell {...homePage({ lang: "it", origin: new URL(c.req.url).origin })} />);
  });
