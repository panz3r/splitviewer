import { describe, expect, it } from "vitest";
import { buildDashboard, sectionize, type DashboardDeps } from "../../src/domain/dashboardService";
import { makeSharesRepo } from "../fakes/repos";
import { makeSplitwiseClient, FakeSplitwiseAuthError } from "../fakes/splitwise";
import type { SplitwiseGroup } from "../../src/lib/splitwise";
import type { UserRow } from "../../src/types";

// Unit tests for the dashboard service: sectioning rules, the reconnect
// outcome on token rejection, and flash resolution.

const DAY_MS = 24 * 60 * 60 * 1000;
const recent = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString();

const GROUP = (overrides: Partial<SplitwiseGroup> & { id: string }): SplitwiseGroup => ({
  name: `Group ${overrides.id}`,
  simplifiedDebts: [{ amount: "0" }],
  updatedAt: recent(1),
  ...overrides,
});

const DEPS = (groups: SplitwiseGroup[] | Error, extra: Partial<DashboardDeps> = {}): DashboardDeps => ({
  decryptToken: async (enc) => `tok:${enc}`,
  splitwise: makeSplitwiseClient({ groups: groups as never }),
  shares: makeSharesRepo(),
  ...extra,
});

const USER: UserRow = {
  id: "u1",
  splitwise_user_id: "sw-1",
  encrypted_access_token: "enc",
  token_expiry: null,
  avatar_url: null,
  first_name: "Ada",
  session_version: 0,
};

function share(groupId: string, active: boolean) {
  return { splitwise_group_id: groupId, slug: `slug-${groupId}`, is_active: active ? 1 : 0 };
}

describe("sectionize", () => {
  it("splits public/private/archived and sorts each by last update desc", () => {
    const groups = [
      GROUP({ id: "a", updatedAt: recent(10) }),
      GROUP({ id: "b", updatedAt: recent(5) }),
      GROUP({ id: "c", updatedAt: recent(60) }), // old + settled → archived
      GROUP({ id: "d", updatedAt: recent(50) }), // old + settled → archived
    ];
    const sharesByGroupId = new Map([
      ["a", share("a", true)],
      ["b", share("b", false)],
      ["c", share("c", false)],
    ]);
    const sections = sectionize(groups, sharesByGroupId);
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s.groups.map((g) => g.id)]));
    expect(byKey.public).toEqual(["a"]); // active share wins over recency
    expect(byKey.private).toEqual(["b"]); // newest first within the section
    expect(byKey.archived).toEqual(["d", "c"]); // settled >40 days, newest first
  });

  it("unpaid groups never archive regardless of age", () => {
    const groups = [
      GROUP({ id: "old", updatedAt: "2020-01-01T00:00:00Z", simplifiedDebts: [{ amount: "5.00" }] }),
    ];
    const sections = sectionize(groups, new Map());
    expect(sections.find((s) => s.key === "archived")?.groups).toHaveLength(0);
    expect(sections.find((s) => s.key === "private")?.groups.map((g) => g.id)).toEqual(["old"]);
  });
});

describe("buildDashboard", () => {
  it("returns reconnect outcome when Splitwise rejects the token (401)", async () => {
    const result = await buildDashboard(USER, "en", {}, DEPS(new FakeSplitwiseAuthError(401)));
    expect(result.kind).toBe("reconnect");
  });

  it("rethrows non-auth Splitwise failures", async () => {
    await expect(
      buildDashboard(USER, "en", {}, DEPS(new FakeSplitwiseAuthError(500))),
    ).rejects.toMatchObject({ name: "SplitwiseAuthError", status: 500 });
  });

  it("filters the Non-group-expenses pseudo-group (id 0) and annotates shares", async () => {
    const groups = [
      GROUP({ id: "0", name: "Non-group expenses" }),
      GROUP({ id: "g1", name: "Flat", updatedAt: "2026-06-01T00:00:00Z" }),
    ];
    const sharesRepo = makeSharesRepo();
    sharesRepo.rows.push({ slug: "slug-g1", userId: "u1", splitwiseGroupId: "g1", groupName: "Flat", isActive: true });
    const result = await buildDashboard(USER, "en", {}, DEPS(groups, { shares: sharesRepo }));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const flat = result.data.sections.flatMap((s) => s.groups).find((g) => g.id === "g1");
    expect(flat).toMatchObject({ name: "Flat", share: { slug: "slug-g1", isActive: true } });
    expect(result.data.sections.flatMap((s) => s.groups).some((g) => g.id === "0")).toBe(false);
  });

  it("resolves flash params into localized text", async () => {
    const result = await buildDashboard(
      USER,
      "it",
      { msg: "created", err: "not_found" },
      DEPS([GROUP({ id: "g1" })]),
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.flashMsg).toBe("Link pubblico generato — copialo qui sotto.");
    expect(result.data.flashErr).toBe("Condivisione inesistente (o appartiene a un altro account).");
  });

  it("renders no flash for unknown params", async () => {
    const result = await buildDashboard(USER, "en", { msg: "h4x", err: "h4x" }, DEPS([]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.flashMsg).toBeUndefined();
    expect(result.data.flashErr).toBeUndefined();
  });
});
