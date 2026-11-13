// Share lifecycle API: POST /api/shares/create, POST /api/shares/revoke.
// Guarded by requireSession (401 JSON on miss). Form-encoded submissions
// (dashboard buttons) get redirects; JSON callers get JSON bodies.
import { Hono } from "hono";
import type { Context } from "hono";
import { requireSession } from "../middleware/session";
import { repoUrl, shareServiceForEnv, SLUG_LENGTH } from "../wiring";
import type { Lang } from "../i18n";
import type { AppEnv } from "../types";

export { SLUG_LENGTH };

function isJson(c: Context): boolean {
  return (c.req.header("content-type") ?? "").includes("application/json");
}

interface CreateInput {
  groupId: string;
  groupName: string;
  lang: Lang; // for post-action redirect (dashboard language)
}

async function parseCreateInput(c: Context<AppEnv>): Promise<CreateInput | null> {
  try {
    if (isJson(c)) {
      const raw = (await c.req.json()) as Record<string, unknown>;
      const groupId = typeof raw.groupId === "string" || typeof raw.groupId === "number" ? String(raw.groupId) : "";
      if (!groupId) return null;
      return {
        groupId,
        groupName: typeof raw.groupName === "string" && raw.groupName ? raw.groupName : `Group ${groupId}`,
        lang: raw.lang === "it" ? "it" : "en",
      };
    }
    const form = await c.req.parseBody();
    const groupId = typeof form.groupId === "string" && form.groupId !== "" ? form.groupId : "";
    if (!groupId) return null;
    return {
      groupId,
      groupName: typeof form.groupName === "string" && form.groupName !== "" ? form.groupName : `Group ${groupId}`,
      lang: form.lang === "it" ? "it" : "en",
    };
  } catch {
    return null;
  }
}

interface RevokeInput {
  slug: string;
  lang: Lang;
}

async function parseRevokeInput(c: Context<AppEnv>): Promise<RevokeInput | null> {
  try {
    if (isJson(c)) {
      const raw = (await c.req.json()) as Record<string, unknown>;
      const slug = typeof raw.slug === "string" && raw.slug ? raw.slug : "";
      return slug ? { slug, lang: raw.lang === "it" ? "it" : "en" } : null;
    }
    const form = await c.req.parseBody();
    const slug = typeof form.slug === "string" && form.slug !== "" ? form.slug : "";
    return slug ? { slug, lang: form.lang === "it" ? "it" : "en" } : null;
  } catch {
    return null;
  }
}

const dashPath = (lang: Lang) => (lang === "it" ? "/it/dashboard" : "/dashboard");

function invalid(c: Context<AppEnv>) {
  return isJson(c)
    ? c.json({ ok: false, error: "invalid_request" }, 400)
    : c.redirect("/dashboard?err=invalid_request", 303);
}

export const shares = new Hono<AppEnv>()

  .use("/api/shares/*", requireSession)

  // Create (or rotate) a share for a group (see domain/shareService for the
  // upsert semantics and retry policy).
  .post("/api/shares/create", async (c) => {
    const input = await parseCreateInput(c);
    if (!input) return invalid(c);

    const user = c.get("user");
    try {
      const slug = await shareServiceForEnv(c.env).create(user.id, input.groupId, input.groupName);
      const origin = new URL(c.req.url).origin;
      if (isJson(c)) {
        return c.json({ ok: true, slug, url: `${origin}/p/${slug}` }, 201);
      }
      return c.redirect(`${dashPath(input.lang)}?msg=created`, 303);
    } catch (error) {
      if (error instanceof Error && error.name === "ShareWriteError") {
        return isJson(c)
          ? c.json({ ok: false, error: "share_write_failed" }, 500)
          : c.redirect(`${dashPath(input.lang)}?err=share_write_failed`, 303);
      }
      throw error;
    }
  })

  .post("/api/shares/revoke", async (c) => {
    const input = await parseRevokeInput(c);
    if (!input) return invalid(c);

    const user = c.get("user");
    const changed = await shareServiceForEnv(c.env).revoke(user.id, input.slug);
    if (!changed) {
      return isJson(c)
        ? c.json({ ok: false, error: "not_found" }, 404)
        : c.redirect(`${dashPath(input.lang)}?err=not_found`, 303);
    }
    return isJson(c)
      ? c.json({ ok: true, active: false })
      : c.redirect(`${dashPath(input.lang)}?msg=revoked`, 303);
  });
