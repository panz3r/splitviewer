// Share lifecycle API: POST /api/shares/create, POST /api/shares/revoke.
// Guarded by requireSession (401 JSON on miss). Form-encoded submissions
// (dashboard buttons) get redirects; JSON callers get JSON bodies.
import { Hono } from "hono";
import type { Context } from "hono";
import { requireSession } from "../middleware/session";
import { shareServiceForEnv } from "../wiring";
import type { Lang } from "../i18n";
import type { AppEnv } from "../types";

function isJson(c: Context): boolean {
  return (c.req.header("content-type") ?? "").includes("application/json");
}

interface CreateInput {
  groupId: string;
  groupName: string;
  lang: Lang; // for post-action redirect (dashboard language)
}

// Splitwise group ids are numeric; slugs use the nanoid URL alphabet.
const GROUP_ID_RE = /^\d{1,20}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_GROUP_NAME_LENGTH = 200;

function toCreateInput(rawId: unknown, rawName: unknown, rawLang: unknown): CreateInput | null {
  const groupId = typeof rawId === "string" || typeof rawId === "number" ? String(rawId).trim() : "";
  if (!GROUP_ID_RE.test(groupId)) return null;
  const name = typeof rawName === "string" ? Array.from(rawName.trim()).slice(0, MAX_GROUP_NAME_LENGTH).join("") : "";
  return {
    groupId,
    groupName: name || `Group ${groupId}`,
    lang: rawLang === "it" ? "it" : "en",
  };
}

async function parseCreateInput(c: Context<AppEnv>): Promise<CreateInput | null> {
  try {
    const raw = isJson(c) ? ((await c.req.json()) as Record<string, unknown>) : await c.req.parseBody();
    return toCreateInput(raw.groupId, raw.groupName, raw.lang);
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
    const raw = isJson(c) ? ((await c.req.json()) as Record<string, unknown>) : await c.req.parseBody();
    if (typeof raw.slug !== "string" || !SLUG_RE.test(raw.slug)) return null;
    return { slug: raw.slug, lang: raw.lang === "it" ? "it" : "en" };
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
