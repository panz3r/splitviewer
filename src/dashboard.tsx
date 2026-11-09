// Organizer dashboard: live group list + share controls. Minimal plain-CSS
// (shared style with the future public view), no external requests.
import { Hono } from "hono";
import { decAccessToken, requireSession } from "./middleware";
import { fetchGroups, SplitwiseAuthError } from "./lib/splitwise";
import type { AppEnv, UserRow } from "./types";

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  header { display: flex; justify-content: space-between; align-items: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #e2e2e2; }
  .badge { font-size: .8rem; padding: .15rem .5rem; border-radius: 999px; }
  .on { background: #dcf5e0; color: #1a5c25; } .off { background: #eee; color: #555; }
  button { border: 1px solid #bbb; background: #fff; border-radius: 6px; padding: .35rem .8rem; cursor: pointer; }
  button.rev { border-color: #d66; color: #a22; }
  code { background: #f4f4f4; padding: .1rem .35rem; border-radius: 4px; font-size: .85rem; }
  .flash { padding: .5rem .8rem; border-radius: 6px; background: #eef7ff; margin: 1rem 0; }
  .flash.err { background: #fdecec; }
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
          <html>
            <head><title>Reconnect Splitwise</title></head>
            <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
              <h1>Splitwise connection expired</h1>
              <p>We couldn't fetch your groups with the stored credentials.</p>
              <p><a href="/auth/login">Reconnect your Splitwise account</a></p>
            </body>
          </html>,
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
      <html>
        <head>
          <title>SplitViewer — Dashboard</title>
          <style>{STYLE}</style>
        </head>
        <body>
          <header>
            <h1>Your Splitwise groups</h1>
            <form method="post" action="/auth/logout">
              <button type="submit">Log out</button>
            </form>
          </header>

          {msg && FLASH_MSGS[msg] ? <p class="flash">{FLASH_MSGS[msg]}</p> : null}
          {err && FLASH_ERRS[err] ? <p class="flash err">{FLASH_ERRS[err]}</p> : null}

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
                            <button class="rev" type="submit">Revoke</button>
                          </form>
                        ) : (
                          <form method="post" action="/api/shares/create">
                            <input type="hidden" name="groupId" value={g.id} />
                            <input type="hidden" name="groupName" value={g.name} />
                            <button type="submit">Create public link</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </body>
      </html>,
    );
  });
