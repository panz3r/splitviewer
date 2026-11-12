// Language middleware (MVC refactor phase 02.11): derives the request language
// from the URL path so controllers never compute it. `/it` and `/it/*` are
// Italian; everything else (including public dashboards) is English by design.
import type { Context, Next } from "hono";
import type { AppEnv } from "../types";
import type { Lang } from "../i18n";

export function requestLang(c: Context<AppEnv>): Lang {
  const path = c.req.path;
  return path === "/it" || path.startsWith("/it/") ? "it" : "en";
}

export async function langMiddleware(c: Context<AppEnv>, next: Next) {
  c.set("lang", requestLang(c));
  await next();
}
