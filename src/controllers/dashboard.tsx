// Dashboard controller (EN at /dashboard, IT at /it/dashboard): thin HTTP
// wiring — buildDashboard (domain) resolves the data, ui/dashboardPage renders.
import { Hono } from "hono";
import type { Context } from "hono";
import { requireSession } from "../middleware/session";
import { buildDashboard } from "../domain/dashboardService";
import { decrypt } from "../lib/crypto";
import { createHttpSplitwiseClient } from "../lib/splitwise";
import { D1SharesRepo } from "../repositories/sharesRepo";
import { PageShell } from "../ui/components";
import { dashboardPage, dashboardReconnectPage } from "../ui/dashboardPage";
import { repoUrl } from "../wiring";
import type { AppEnv } from "../types";
import type { Lang } from "../i18n";

async function renderDashboard(c: Context<AppEnv>, lang: Lang) {
  const user = c.get("user");
  const result = await buildDashboard(
    user,
    lang,
    { msg: c.req.query("msg"), err: c.req.query("err") },
    {
      decryptToken: (encrypted) => decrypt(encrypted, c.env.TOKEN_ENCRYPTION_KEY),
      splitwise: createHttpSplitwiseClient(),
      shares: new D1SharesRepo(c.env),
    },
  );
  return c.html(
    <PageShell
      {...(result.kind === "reconnect"
        ? dashboardReconnectPage(lang, repoUrl(c.env))
        : dashboardPage({
            lang,
            user: { avatarUrl: user.avatar_url, firstName: user.first_name },
            data: result.data,
            origin: new URL(c.req.url).origin,
            repoUrl: repoUrl(c.env),
          }))}
    />,
  );
}

export const dashboard = new Hono<AppEnv>()

  .use("/dashboard", requireSession)
  .use("/it/dashboard", requireSession)

  .get("/dashboard", (c) => renderDashboard(c, "en"))
  .get("/it/dashboard", (c) => renderDashboard(c, "it"));
