// Organizer dashboard (EN at /dashboard, IT at /it/dashboard): group cards
// with share actions, on the shared shell. The share-button script is the
// only client JS in the app (public pages stay JS-free by design).
import { Hono } from "hono";
import { decAccessToken, requireSession } from "./middleware";
import { fetchGroups, SplitwiseAuthError, type SplitwiseGroup } from "./lib/splitwise";
import { getDict, type Dict, type Lang } from "./i18n";
import { PageShell, Flash, type PageShellProps } from "./ui/components";
import type { AppEnv, UserRow } from "./types";

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
    var labels = JSON.parse(btn.getAttribute("data-labels"));
    var supportsShare = typeof navigator.share === "function";
    btn.textContent = supportsShare ? labels.share : labels.shareNoWebShare;
    btn.addEventListener("click", function () {
      if (supportsShare) {
        navigator.share({ title: "SplitViewer", url: url }).then(
          function () { showToast(labels.sharedToast); },
          function (err) {
            if (err && err.name !== "AbortError") showToast(labels.couldNotShare);
          }
        );
      } else {
        navigator.clipboard.writeText(url).then(
          function () { showToast(labels.copiedToast); },
          function () {
            showToast(labels.copyFallback);
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

function Badge({ on, t }: { on: boolean; t: Dict }) {
  return <span class={`badge ${on ? "" : "badge--off"}`}>{on ? t.dash.sections.public.toLowerCase() : "off"}</span>;
}

interface ShareRow {
  slug: string;
  is_active: number;
}

function GroupCard(
  { groupId, name, avatarUrl, share, origin, lang, t }:
  { groupId: string; name: string; avatarUrl?: string; share: ShareRow | undefined; origin: string; lang: Lang; t: Dict },
) {
  const active = share?.is_active === 1;
  const url = `${origin}/p/${share?.slug ?? ""}`;
  const labels = JSON.stringify({
    share: t.dash.share,
    shareNoWebShare: t.dash.shareNoWebShare,
    sharedToast: t.dash.sharedToast,
    couldNotShare: t.dash.couldNotShare,
    copiedToast: t.dash.copiedToast,
    copyFallback: t.dash.copyFallback,
  });
  return (
    <div class="card gcard">
      <div class="row">
        <span class="gname">
          {avatarUrl ? (
            <img class="gavatar" src={avatarUrl} alt="" />
          ) : null}
          {name}
        </span>
        <Badge on={active} t={t} />
      </div>
      {active ? (
        <>
          {/* No-JS fallback: show the raw link so the dashboard still works
              with scripts off; with JS the Share button covers it. */}
          <noscript>
            <p class="muted small" style="margin: .5rem 0; overflow-wrap: anywhere;">
              <code>{url}</code>
            </p>
          </noscript>
          <div class="actions">
            <a class="btn btn--primary" href={url}>{t.dash.open}</a>
            <button
              class="btn"
              type="button"
              data-share={url}
              data-labels={labels}
              aria-label={t.dash.shareAria}
            >
              {t.dash.shareNoWebShare}
            </button>
            <form method="post" action="/api/shares/revoke" class="neg">
              <input type="hidden" name="slug" value={share?.slug ?? ""} />
              <input type="hidden" name="lang" value={lang} />
              <button class="btn btn--danger" type="submit" aria-label={t.dash.revokeAria}>
                {t.dash.revoke}
              </button>
            </form>
          </div>
        </>
      ) : (
        <form method="post" action="/api/shares/create" style="margin-top: .8rem;">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="groupName" value={name} />
          <input type="hidden" name="lang" value={lang} />
          <button class="btn btn--primary" type="submit">{t.dash.create}</button>
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
  sharesByGroupId: Map<string, ShareRow>,
): { key: "public" | "private" | "archived"; groups: SplitwiseGroup[] }[] {
  const archived = groups.filter(
    (g) =>
      isSettled(g) &&
      typeof g.updatedAt === "string" &&
      Date.now() - new Date(g.updatedAt).getTime() > ARCHIVE_AFTER_MS,
  );
  const rest = groups.filter((g) => !archived.includes(g));
  const publicGroups = rest.filter((g) => sharesByGroupId.get(g.id)?.is_active === 1);
  const privateGroups = rest.filter((g) => sharesByGroupId.get(g.id)?.is_active !== 1);
  return [
    { key: "public", groups: sortByLastUpdateDesc(publicGroups) },
    { key: "private", groups: sortByLastUpdateDesc(privateGroups) },
    { key: "archived", groups: sortByLastUpdateDesc(archived) },
  ];
}

function dashboardPage(c: { env: AppEnv["Bindings"]; req: { url: string; query: (k: string) => string | undefined } }, user: UserRow, lang: Lang): Promise<PageShellProps> {
  return (async () => {
    const t = getDict(lang);

    let groups: SplitwiseGroup[];
    try {
      const token = await decAccessToken(user, c.env);
      groups = await fetchGroups(token);
    } catch (error) {
      if (error instanceof SplitwiseAuthError && error.status === 401) {
        // Token no longer accepted: reconnect page instead of a 500.
        return {
          title: `${t.dash.reconnectTitle} — SplitViewer`,
          lang,
          hideNav: true,
          children: (
            <div class="card">
              <h1 style="margin-top: 0;">{t.dash.reconnectTitle}</h1>
              <p>{t.dash.reconnectBody}</p>
              <a class="btn btn--primary" href="/auth/login">{t.dash.reconnectCta}</a>
            </div>
          ),
        };
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
    const origin = new URL(c.req.url).origin;
    const flashMsg =
      msg && msg in t.dash ? t.dash[msg as "flashCreated" | "flashRevoked"] : undefined;
    const flashErr =
      err && err in t.dash
        ? t.dash[err as "flashInvalid" | "flashNotFound" | "flashWriteFailed"]
        : undefined;

    return {
      title: t.dash.title,
      lang,
      user: { avatarUrl: user.avatar_url, firstName: user.first_name },
      children: (
        <>
          <style>{GAVATAR_STYLE}</style>
          <style>{TOAST_STYLE}</style>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: .8rem;">
            <h1 style="margin: .2rem 0;">{t.dash.heading}</h1>
          </div>

          <Flash msg={flashMsg} err={flashErr} />

          {visibleGroups.length === 0 ? (
            <div class="card">
              <p style="margin: 0;">{t.dash.empty}</p>
            </div>
          ) : (
            sectionize(visibleGroups, sharesByGroupId).map(
              (section) =>
                section.groups.length > 0 && (
                  <>
                    <h2 class="section-title" style="font-size: 1.15rem; margin: 1.6rem 0 .8rem;">
                      {t.dash.sections[section.key]}
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
                            lang={lang}
                            t={t}
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
              browser gets a syntax-error script tag. Labels are injected as
              data-attributes (JSON) so the script is language-agnostic. */}
          <div id="toast" class="toast" aria-live="polite"></div>
          <script dangerouslySetInnerHTML={{ __html: SHARE_SCRIPT }} />
        </>
      ),
    };
  })();
}

export const dashboard = new Hono<AppEnv>()

  .use("/dashboard", requireSession)
  .use("/it/dashboard", requireSession)

  .get("/dashboard", async (c) =>
    c.html(<PageShell {...(await dashboardPage(c, c.get("user"), "en"))} />))
  .get("/it/dashboard", async (c) =>
    c.html(<PageShell {...(await dashboardPage(c, c.get("user"), "it"))} />));
