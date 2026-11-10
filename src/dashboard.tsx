// Organizer dashboard: live group list + share controls, on the shared shell.
// Local CSS covers only the table layout — tokens live in src/ui/styles.ts.
import { Hono } from "hono";
import { decAccessToken, requireSession } from "./middleware";
import { fetchGroups, SplitwiseAuthError } from "./lib/splitwise";
import { PageShell, Flash } from "./ui/components";
import type { AppEnv, UserRow } from "./types";

const TABLE_STYLE = `
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--line); }
  td { font-variant-numeric: tabular-nums; }
  .rev { border-color: #d9a1a1; color: #a22; }
  .url-cell code { font-size: .85rem; }
  /* PageShell already ships .badge/.btn/.flash tokens; keep only table rules */
`;

const FLASH_MSGS: Record<string, string> = {
  created: "Public link generated.",
  revoked: "Share revoked — the public link is dead.",
};
const FLASH_ERRS: Record<string, string> = {
  invalid_request: "That didn't look right — try again.",
  not_found: "No such share (or it belongs to another account).",
  share_write_failed: "Couldn't save the share. Please retry.",
};

function Badge({ on }: { on: boolean }) {
  return (
    <span class={`badge ${on ? "on" : "off"}`}>{on ? "public" : "off"}</span>
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
          <PageShell
            title="Reconnect Splitwise — SplitViewer"
            hideNav
          >
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
        <div style="display:flex; justify-content:space-between; align-items:center; gap:.8rem;">
          <h1 style="margin:.2rem 0;">Your Splitwise groups</h1>
          <form method="post" action="/auth/logout">
            <button class="btn" type="submit">Log out</button>
          </form>
        </div>

        <Flash msg={msg && FLASH_MSGS[msg] ? FLASH_MSGS[msg] : undefined} err={err && FLASH_ERRS[err] ? FLASH_ERRS[err] : undefined} />
        <style>{TABLE_STYLE}</style>

          {visibleGroups.length === 0 ? (
            <p>No groups found in your Splitwise account.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Group</th><th>Status</th><th>Public link</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const share = sharesByGroupId.get(g.id);
                  return (
                    <tr>
                      <td>{g.name || `Group ${g.id}`}</td>
                      <td><Badge on={share?.is_active === 1} /></td>
                      <td>{share?.is_active === 1 ? <code>{`${origin}/p/${share.slug}`}</code> : <em>—</em>}</td>
                      <td style="text-align:right">
                        {share?.is_active === 1 ? (
                          <form method="post" action="/api/shares/revoke">
                            <input type="hidden" name="slug" value={share.slug} />
                            <button class="btn rev" type="submit">Revoke</button>
                          </form>
                        ) : (
                          <form method="post" action="/api/shares/create">
                            <input type="hidden" name="groupId" value={g.id} />
                            <input type="hidden" name="groupName" value={g.name} />
                            <button class="btn" type="submit">Create public link</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </PageShell>,
    );
  });
