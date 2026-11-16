import { env } from "cloudflare:workers";
import worker from "../../src/index";
import { describe, expect, it } from "vitest";
import { signSession } from "../../src/domain/sessionService";
import { encrypt } from "../../src/lib/crypto";
import type { UserRow } from "../../src/types";

// Dashboard + shares API tests. These paths never call Splitwise outbound
// (share endpoints are D1-only; the dashboard is only tested unauthenticated
// here), so no network mocking is needed. Live dashboard rendering is verified
// manually in the browser.

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function insertUser(splitwiseId: string): Promise<UserRow> {
  const id = crypto.randomUUID();
  const enc = await encrypt("fake-access-token", env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare(
    `INSERT INTO users (id, splitwise_user_id, encrypted_access_token, encrypted_refresh_token)
     VALUES (?1, ?2, ?3, ?3)`,
  )
    .bind(id, splitwiseId, enc)
    .run();
  return {
    id,
    splitwise_user_id: splitwiseId,
    encrypted_access_token: enc,
    token_expiry: null,
  };
}

/** Returns the raw `sw_session` JWT (header value for `Cookie:`). */
async function sessionCookie(userId: string): Promise<string> {
  return `sw_session=${await signSession(userId, env.SESSION_SECRET)}`;
}



const fetchRoute = async (path: string, init?: RequestInit) => {
  const request = new IncomingRequest(`https://example.com${path}`, init);
  const { createExecutionContext, waitOnExecutionContext } = await import(
    "cloudflare:test"
  );
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

describe("auth gating", () => {
  it("redirects unauthenticated GET /dashboard to /auth/login", async () => {
    const res = await fetchRoute("/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/login");
  });

  it("401s unauthenticated POST /api/shares/create with JSON", async () => {
    const res = await fetchRoute("/api/shares/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: "1", groupName: "X" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("denies a session cookie that references a deleted user", async () => {
    const ghost = crypto.randomUUID();
    const res = await fetchRoute("/dashboard", {
      headers: { Cookie: await sessionCookie(ghost) },
    });
    expect(res.status).toBe(302);
  });
});

describe("POST /api/shares/create (JSON)", () => {
  it("creates a share with a 16-char slug and returns the public URL", async () => {
    const user = await insertUser("31111");
    const res = await fetchRoute("/api/shares/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await sessionCookie(user.id),
      },
      body: JSON.stringify({ groupId: "31111", groupName: "Flat 31111" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await res.json()) as { ok: boolean; slug: string; url: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(body.url).toBe(`https://example.com/p/${body.slug}`);

    const row = await env.DB.prepare(
      "SELECT * FROM shares WHERE slug = ?1",
    )
      .bind(body.slug)
      .first<{ is_active: number; group_name: string }>();
    expect(row?.is_active).toBe(1);
    expect(row?.group_name).toBe("Flat 31111");
  });

  it("rotates the slug on re-create (single row, new slug)", async () => {
    const user = await insertUser("31112");
    const cookie = await sessionCookie(user.id);
    const first = (await (
      await fetchRoute("/api/shares/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ groupId: "31112", groupName: "Flat" }),
      })
    ).json()) as { slug: string };
    const second = (await (
      await fetchRoute("/api/shares/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ groupId: "31112", groupName: "Flat" }),
      })
    ).json()) as { slug: string };

    expect(second.slug).not.toBe(first.slug);
    const rows = await env.DB.prepare(
      "SELECT count(*) AS n FROM shares WHERE user_id = ?1 AND splitwise_group_id = '31112'",
    )
      .bind(user.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("rejects invalid bodies with 400", async () => {
    const user = await insertUser("31113");
    const res = await fetchRoute("/api/shares/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await sessionCookie(user.id) },
      body: JSON.stringify({ groupName: "no id" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric group ids and malformed revoke slugs with 400", async () => {
    const cookie = await sessionCookie((await insertUser("31120")).id);
    const post = (path: string, body: unknown) =>
      fetchRoute(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
    expect((await post("/api/shares/create", { groupId: "1/../2", groupName: "X" })).status).toBe(400);
    expect((await post("/api/shares/create", { groupId: "1".repeat(21) })).status).toBe(400);
    expect((await post("/api/shares/revoke", { slug: "../etc" })).status).toBe(400);
  });

  it("caps the stored group name length", async () => {
    const user = await insertUser("31121");
    const res = await fetchRoute("/api/shares/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await sessionCookie(user.id) },
      body: JSON.stringify({ groupId: 31121, groupName: "x".repeat(5000) }),
    });
    expect(res.status).toBe(201);
    const { slug } = (await res.json()) as { slug: string };
    const row = await env.DB.prepare("SELECT group_name FROM shares WHERE slug = ?1")
      .bind(slug)
      .first<{ group_name: string }>();
    expect(row?.group_name).toHaveLength(200);
  });
});

describe("POST /api/shares/revoke (JSON)", () => {
  it("deactivates own share, then stays idempotent-200", async () => {
    const user = await insertUser("31114");
    const cookie = { "Content-Type": "application/json", Cookie: await sessionCookie(user.id) };
    const created = (await (
      await fetchRoute("/api/shares/create", {
        method: "POST",
        headers: cookie,
        body: JSON.stringify({ groupId: "31114", groupName: "Flat" }),
      })
    ).json()) as { slug: string };

    const revoke = await fetchRoute("/api/shares/revoke", {
      method: "POST",
      headers: cookie,
      body: JSON.stringify({ slug: created.slug }),
    });
    expect(revoke.status).toBe(200);
    expect((await revoke.json()) as { ok: boolean }).toEqual({ ok: true, active: false });

    const row = await env.DB.prepare("SELECT is_active FROM shares WHERE slug = ?1")
      .bind(created.slug)
      .first<{ is_active: number }>();
    expect(row?.is_active).toBe(0);

    const again = await fetchRoute("/api/shares/revoke", {
      method: "POST",
      headers: cookie,
      body: JSON.stringify({ slug: created.slug }),
    });
    expect(again.status).toBe(200);
  });

  it("404s when the slug belongs to another user", async () => {
    const owner = await insertUser("31115");
    const attacker = await insertUser("31116");
    const created = (await (
      await fetchRoute("/api/shares/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: await sessionCookie(owner.id) },
        body: JSON.stringify({ groupId: "31115", groupName: "Flat" }),
      })
    ).json()) as { slug: string };

    const res = await fetchRoute("/api/shares/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await sessionCookie(attacker.id) },
      body: JSON.stringify({ slug: created.slug }),
    });
    expect(res.status).toBe(404);
  });
});

describe("form-encoded flow (dashboard buttons)", () => {
  it("create redirects 303 to /dashboard?msg=created", async () => {
    const user = await insertUser("31117");
    const res = await fetchRoute("/api/shares/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: await sessionCookie(user.id),
        Origin: "https://example.com",
      },
      body: new URLSearchParams({ groupId: "31117", groupName: "Flat" }).toString(),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/dashboard?msg=created");
  });

  it("revoke redirects 303 to /dashboard?msg=revoked", async () => {
    const user = await insertUser("31118");
    const cookie = await sessionCookie(user.id);
    const created = (await (
      await fetchRoute("/api/shares/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ groupId: "31118", groupName: "Flat" }),
      })
    ).json()) as { slug: string };

    const res = await fetchRoute("/api/shares/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie,
        Origin: "https://example.com",
      },
      body: new URLSearchParams({ slug: created.slug }).toString(),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/dashboard?msg=revoked");
  });
});

describe("dashboard cards (M4)", () => {
  it("shows the reconnect page (not 5xx) when Splitwise rejects the stored token", async () => {
    // Dashboard content with cards requires a live, valid token — verified in
    // the browser (visual pass). With a test fixture token, Splitwise 401s
    // deterministically, which must render the friendly reconnect page.
    const user = await insertUser("31119");
    const res = await fetchRoute("/dashboard", {
      headers: { Cookie: await sessionCookie(user.id) },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const html = await res.text();
    expect(html).toContain("Splitwise connection expired");
    expect(html).not.toContain("data-copy");
  });
});
