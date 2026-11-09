// Share lifecycle API: POST /api/shares/create, POST /api/shares/revoke.
// Guarded by requireSession (401 JSON on miss). Form-encoded submissions
// (dashboard buttons) get redirects; JSON callers get JSON bodies.
import { Hono } from "hono";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { requireSession } from "./middleware";
import { deleteCache } from "./lib/cache";
import type { AppEnv } from "./types";

export const SLUG_LENGTH = 16;

function isJson(c: Context): boolean {
  return (c.req.header("content-type") ?? "").includes("application/json");
}

interface CreateInput {
  groupId: string;
  groupName: string;
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
      };
    }
    const form = await c.req.parseBody();
    const groupId = typeof form.groupId === "string" && form.groupId !== "" ? form.groupId : "";
    if (!groupId) return null;
    return {
      groupId,
      groupName: typeof form.groupName === "string" && form.groupName !== "" ? form.groupName : `Group ${groupId}`,
    };
  } catch {
    return null;
  }
}

interface RevokeInput {
  slug: string;
}

async function parseRevokeInput(c: Context<AppEnv>): Promise<RevokeInput | null> {
  try {
    if (isJson(c)) {
      const raw = (await c.req.json()) as Record<string, unknown>;
      const slug = typeof raw.slug === "string" && raw.slug ? raw.slug : "";
      return slug ? { slug } : null;
    }
    const form = await c.req.parseBody();
    const slug = typeof form.slug === "string" && form.slug !== "" ? form.slug : "";
    return slug ? { slug } : null;
  } catch {
    return null;
  }
}

function invalid(c: Context<AppEnv>) {
  return isJson(c)
    ? c.json({ ok: false, error: "invalid_request" }, 400)
    : c.redirect("/dashboard?err=invalid_request", 303);
}

export const shares = new Hono<AppEnv>()

  .use("/api/shares/*", requireSession)

  // Create (or rotate) a share for a group. Upsert keyed on
  // (user_id, splitwise_group_id): re-sharing replaces the slug, quietly
  // killing any old public link WITHOUT needing cascade deletes elsewhere.
  .post("/api/shares/create", async (c) => {
    const input = await parseCreateInput(c);
    if (!input) return invalid(c);

    const user = c.get("user");
    let slug = nanoid(SLUG_LENGTH);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT INTO shares (slug, user_id, splitwise_group_id, group_name)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, splitwise_group_id) DO UPDATE SET
               slug = ?1, group_name = ?4, is_active = 1`,
          ).bind(slug, user.id, input.groupId, input.groupName),
          c.env.DB.prepare(
            "SELECT slug, is_active FROM shares WHERE user_id = ?1 AND splitwise_group_id = ?2",
          ).bind(user.id, input.groupId),
        ]);
        break;
      } catch {
        // Unknown D1/SQLite failure: on a slug-PK collision (astronomically
        // rare) rotate and retry; anything else a third attempt will still
        // fail loudly below if slug never got written.
        slug = nanoid(SLUG_LENGTH);
        if (attempt === 2) {
          console.error("shares/create: failed after 3 attempts");
          return isJson(c)
            ? c.json({ ok: false, error: "share_write_failed" }, 500)
            : c.redirect("/dashboard?err=share_write_failed", 303);
        }
      }
    }

    const origin = new URL(c.req.url).origin;
    if (isJson(c)) {
      return c.json({ ok: true, slug, url: `${origin}/p/${slug}` }, 201);
    }
    return c.redirect("/dashboard?msg=created", 303);
  })

  .post("/api/shares/revoke", async (c) => {
    const input = await parseRevokeInput(c);
    if (!input) return invalid(c);

    const user = c.get("user");
    const res = await c.env.DB.prepare(
      "UPDATE shares SET is_active = 0 WHERE slug = ?1 AND user_id = ?2",
    )
      .bind(input.slug, user.id)
      .run();
    if ((res.meta.changes ?? 0) === 0) {
      return isJson(c)
        ? c.json({ ok: false, error: "not_found" }, 404)
        : c.redirect("/dashboard?err=not_found", 303);
    }
    // Revocation must be instant: the public page also checks is_active, but
    // dropping the cache makes "revoked" and "missing" truly identical.
    await deleteCache(c.env, input.slug);
    return isJson(c)
      ? c.json({ ok: true, active: false })
      : c.redirect("/dashboard?msg=revoked", 303);
  });
