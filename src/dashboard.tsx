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

  // Scripts produced via hono/jsx children get HTML-escaped (broken JS!) —
  // they MUST be emitted with dangerouslySetInnerHTML (see script-escape-check
  // note in plans/m4-ux-polish.md). Toast feedback included.
const SHARE_SCRIPT = `
  function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    if (t._h) clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  document.querySelectorAll("[data-share]").forEach(function (btn) {
    var url = btn.getAttribute("data-share");
    var supportsShare = typeof navigator.share === "function";
    btn.textContent = supportsShare ? "Share" : "Share URL";
    btn.addEventListener("click", function () {
      if (supportsShare) {
        navigator.share({ title: "SplitViewer", url: url }).then(
          function () { showToast("Shared — thanks!"); },
          function (err) {
            // Cancelling the sheet is not an error the user must see.
            if (err && err.name !== "AbortError") showToast("Could not share");
          }
        );
      } else {
        navigator.clipboard.writeText(url).then(
          function () { showToast("Link copied to clipboard"); },
          function () {
            btn.disabled = true;
            showToast("Press Cmd/Ctrl+C to copy the link");
          }
        );
      }
    });
  });
`;

const GAVATAR_STYLE = `
  .gavatar { width: 2.6rem; height: 2.6rem; border-radius: 8px; object-fit: cover;
             border: 1px solid var(--line); background: var(--soft); }
  .gcard .gname { display: flex; align-items: center; gap: .55rem; }
  .gcard .row { margin-bottom: .4rem; }
`;

const TOAST_STYLE = `
  .toast { position: fixed; left: 50%; bottom: 1.4rem; transform: translateX(-50%) translateY(8px);
           background: var(--ink); color: var(--paper); padding: .65rem 1.1rem; border-radius: 10px;
           box-shadow: var(--shadow); font-size: .95rem; opacity: 0; pointer-events: none;
           transition: opacity .2s, transform .2s; z-index: 100; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

function Badge({ on }: { on: boolean }) {
  return (
    <span class={`badge ${on ? "" : "badge--off"}`}>{on ? "public" : "off"}</span>
  );
}

function GroupCard({ groupId, name, avatarUrl, share, origin }: { groupId: string; name: string; avatarUrl?: string; share: { slug: string; is_active: number } | undefined; origin: string }) {
  const active = share?.is_active === 1;
  const url = `${origin}/p/${share?.slug ?? ""}`;
  return (
    <div class="card gcard">
      <div class="row">
        <span class="gname">
          {avatarUrl ? (
            <img class="gavatar" src={avatarUrl} alt="" />
          ) : null}
          {name}
        </span>
        <Badge on={active} />
      </div>
      {active ? (
        <>
          {/* No-JS fallback: show the raw link so the dashboard still works
              with scripts off; JS browsers hide it (Share covers it). */}
          <noscript>
            <p class="muted small" style="margin: .5rem 0; overflow-wrap: anywhere;">
              <code>{url}</code>
            </p>
          </noscript>
          <div class="actions">
            <a class="btn btn--primary" href={url}>Open</a>
            <button
              class="btn"
              type="button"
              data-share={url}
              aria-label="Share the public link"
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
      <PageShell
        title="Your groups — SplitViewer"
        user={{ avatarUrl: user.avatar_url, firstName: user.first_name }}
      >
        <style>{GAVATAR_STYLE}</style>
        <style>{TOAST_STYLE}</style>
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
                          avatarUrl={g.avatarUrl}
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

        {/* Toast + share script. NOTE: hono/jsx escapes string children, so
            the script MUST go through dangerouslySetInnerHTML (raw) or the
            browser gets a syntax-error script tag. */}
        <div id="toast" class="toast" aria-live="polite"></div>
        <script dangerouslySetInnerHTML={{ __html: SHARE_SCRIPT }} />
      </PageShell>,
    );
  });
