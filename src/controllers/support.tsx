// Support controller (EN at /support, IT at /it/support): thin HTTP wiring on
// top of ui/supportPage.
import { Hono } from "hono";
import { PageShell } from "../ui/components";
import { supportPage } from "../ui/supportPage";
import { repoUrl } from "../wiring";
import type { AppEnv } from "../types";

export const supportRoutes = new Hono<AppEnv>()

  .get("/support", (c) =>
    c.html(<PageShell {...supportPage({ lang: "en", origin: new URL(c.req.url).origin, repoUrl: repoUrl(c.env) })} />))
  .get("/it/support", (c) =>
    c.html(<PageShell {...supportPage({ lang: "it", origin: new URL(c.req.url).origin, repoUrl: repoUrl(c.env) })} />));
