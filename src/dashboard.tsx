// Organizer dashboard: group cards with share actions, on the shared shell.
// The copy-link button is the only client JS in the app (dashboard is the
// authenticated surface; public pages stay JS-free by design).
import { Hono } from "hono";
import { decAccessToken, requireSession } from "./middleware";
import { fetchGroups, SplitwiseAuthError } from "./lib/splitwise";
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
          <p class="url muted" style="margin: .5rem 0;">
            <code>{url}</code>
          </p>
          <div class="actions">
            <a class="btn btn--primary" href={url}>Open</a>
            <button class="btn" type="button" data-copy={url} aria-label="Copy share link">
              Copy
            </button>
            <form method="post" action="/api/shares/revoke">
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
          <div class="ggrid">
            {visibleGroups.map((g) => {
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
        )}

        <script>{COPY_SCRIPT}</script>
      </PageShell>,
    );
  });
