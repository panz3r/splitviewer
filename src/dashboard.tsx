// Organizer dashboard: group cards with share actions, on the shared shell.
// The copy-link button is the only client JS in the app (dashboard is the
// authenticated surface; public pages stay JS-free by design).
import { Hono } from "hono";
import { decAccessToken, requireSession } from "./middleware";
import { fetchGroups, SplitwiseAuthError, type SplitwiseGroup } from "./lib/splitwise";
import { PageShell, Flash } from "./ui/components";
import type { AppEnv, UserRow } from "./types";

const FLASH_MSGS: Record<string, string> = {
  created: "Public link generated — copy it below.",
  revoked: "Share revoked — the public link is dead.",
};
const FLASH_ERRS: Record<string, string> = {
  invalid_request: "That didn't look right — try again.",
  not_found: "No such share (or it belongs to another account).",
  share_write_failed: "Couldn't save the share. Please retry.",
};

const COPY_SCRIPT = `
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-copy");
      navigator.clipboard.writeText(url).then(function () {
        btn.textContent = "Copied!";
        btn.disabled = true;
        window.setTimeout(function () {
          btn.textContent = "Copy";
          btn.disabled = false;
        }, 1500);
      });
    });
  });
`;

function Badge({ on }: { on: boolean }) {
  return (
    <span class={`badge ${on ? "" : "badge--off"}`}>{on ? "public" : "off"}</span>
  );
}

function GroupCard({ groupId, name, share, origin }: { groupId: string; name: string; share: { slug: string; is_active: number } | undefined; origin: string }) {
  const active = share?.is_active === 1;
  const url = `${origin}/p/${share?.slug ?? ""}`;
  return (
    <div class="card gcard">
      <div class="row">
        <span class="gname">{name}</span>
        <Badge on={active} />
      </div>
      {active ? (
        <>
          <div class="actions">
            <a class="btn btn--primary" href={url}>Open</a>
            <button
              class="btn"
              type="button"
              data-copy={url}
              aria-label="Copy share link"
            >
              Share URL
            </button>
            <form method="post" action="/api/shares/revoke" class="neg">
              <input type="hidden" name="slug" value={share?.slug ?? ""} />
              <button class="btn btn--danger" type="submit" aria-label="Revoke share">
                Revoke
              </button>
            </form>
          </div>
        </>
      ) : (
        <form method="post" action="/api/shares/create" style="margin-top: .8rem;">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="groupName" value={name} />
          <button class="btn btn--primary" type="submit">Create public link</button>
        </form>
      )}
    </div>
  );
}

// --- Sectioning (M4) -------------------------------------------------------
// "Archived" follows Splitwise's own rule: settled up for more than 40 days.
const ARCHIVE_AFTER_MS = 40 * 24 * 60 * 60 * 1000;

function isSettled(group: { simplifiedDebts: Array<{ amount: string }> }): boolean {
  return group.simplifiedDebts.every((d) => Number(d.amount) === 0);
}

function sortByLastUpdateDesc(groups: SplitwiseGroup[]): SplitwiseGroup[] {
  return [...groups].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
}

function sectionize(
  groups: SplitwiseGroup[],
  sharesByGroupId: Map<string, { slug: string; is_active: number }>,
  now = Date.now(),
): { label: string; groups: SplitwiseGroup[] }[] {
  const archived = groups.filter(
    (g) =>
      isSettled(g) &&
      typeof g.updatedAt === "string" &&
      now - new Date(g.updatedAt).getTime() > ARCHIVE_AFTER_MS,
  );
  const rest = groups.filter((g) => !archived.includes(g));
  const publicGroups = rest.filter(
    (g) => sharesByGroupId.get(g.id)?.is_active === 1,
  );
  const privateGroups = rest.filter(
    (g) => sharesByGroupId.get(g.id)?.is_active !== 1,
  );
  return [
    { label: "Public", groups: sortByLastUpdateDesc(publicGroups) },
    { label: "Private", groups: sortByLastUpdateDesc(privateGroups) },
    { label: "Archived", groups: sortByLastUpdateDesc(archived) },
  ];
}

export const dashboard = new Hono<AppEnv>()

  .use("/dashboard", requireSession)

  .get("/dashboard", async (c) => {
    const user: UserRow = c.get("user");
    const origin = new URL(c.req.url).origin;

    let groups: Awaited<ReturnType<typeof fetchGroups>>;
    try {
      const token = await decAccessToken(user, c.env);
      groups = await fetchGroups(token);
    } catch (error) {
      if (error instanceof SplitwiseAuthError && error.status === 401) {
        // Token no longer accepted: show reconnect page instead of a 500.
        // Auto-refresh logic is Phase 6.
        return c.html(
          <PageShell title="Reconnect Splitwise — SplitViewer" hideNav>
            <div class="card">
              <h1 style="margin-top: 0;">Splitwise connection expired</h1>
              <p>We couldn't fetch your groups with the stored credentials.</p>
              <a class="btn btn--primary" href="/auth/login">Reconnect your Splitwise account</a>
            </div>
          </PageShell>,
        );
      }
      throw error;
    }

    const shareRows = await c.env.DB.prepare(
      "SELECT splitwise_group_id, slug, is_active FROM shares WHERE user_id = ?1",
    )
      .bind(user.id)
      .all<{ splitwise_group_id: string; slug: string; is_active: number }>();
    const sharesByGroupId = new Map(
      (shareRows.results ?? []).map((s) => [s.splitwise_group_id, s]),
    );

    // Splitwise returns id 0 ("Non-group expenses") in get_groups — not
    // shareable; filter it out of the dashboard.
    const visibleGroups = groups.filter((g) => g.id !== "0");

    const msg = c.req.query("msg");
    const err = c.req.query("err");

    return c.html(
      <PageShell title="Your groups — SplitViewer">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: .8rem;">
          <h1 style="margin: .2rem 0;">Your Splitwise groups</h1>
          <form method="post" action="/auth/logout">
            <button class="btn" type="submit">Log out</button>
          </form>
        </div>

        <Flash msg={msg && FLASH_MSGS[msg] ? FLASH_MSGS[msg] : undefined} err={err && FLASH_ERRS[err] ? FLASH_ERRS[err] : undefined} />

        {visibleGroups.length === 0 ? (
          <div class="card">
            <p style="margin: 0;">
              No groups found in your Splitwise account. Create one in Splitwise first,
              then come back and refresh.
            </p>
          </div>
        ) : (
          sectionize(visibleGroups, sharesByGroupId).map(
            (section) =>
              section.groups.length > 0 && (
                <>
                  <h2 class="section-title" style="font-size: 1.15rem; margin: 1.6rem 0 .8rem;">
                    {section.label}
                  </h2>
                  <div class="ggrid">
                    {section.groups.map((g) => {
                      const share = sharesByGroupId.get(g.id);
                      return (
                        <GroupCard
                          groupId={g.id}
                          name={g.name || `Group ${g.id}`}
                          share={share}
                          origin={origin}
                        />
                      );
                    })}
                  </div>
                </>
              ),
          )
        )}

        <script>{COPY_SCRIPT}</script>
      </PageShell>,
    );
  });
