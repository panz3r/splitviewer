// Dashboard view (presentation only): group cards with share actions on the
// shared shell. The share-button script is the only client JS in the app
// (public pages stay JS-free by design). All data arrives via props — the
// sectioning/flash logic lives in domain/dashboardService.
import type { FC } from "hono/jsx";
import { getDict, type Dict, type Lang } from "../i18n";
import { Flash, type PageShellProps } from "./components";
import type { DashboardData, DashboardGroup, DashboardShare } from "../domain/types";

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

const Badge: FC<{ on: boolean; t: Dict }> = ({ on, t }) => (
  <span class={`badge ${on ? "" : "badge--off"}`}>{on ? t.dash.sections.public.toLowerCase() : "off"}</span>
);

const GroupCard: FC<{
  group: DashboardGroup;
  origin: string;
  lang: Lang;
  t: Dict;
}> = ({ group, origin, lang, t }) => {
  const share: DashboardShare | null = group.share;
  const active = share?.isActive === true;
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
          {group.avatarUrl ? (
            <img class="gavatar" src={group.avatarUrl} alt="" />
          ) : null}
          {group.name}
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
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="groupName" value={group.name} />
          <input type="hidden" name="lang" value={lang} />
          <button class="btn btn--primary" type="submit">{t.dash.create}</button>
        </form>
      )}
    </div>
  );
};

/** Reconnect page (token rejected by Splitwise). */
export function dashboardReconnectPage(lang: Lang, repoUrl?: string): PageShellProps {
  const t = getDict(lang);
  return {
    title: `${t.dash.reconnectTitle} — SplitViewer`,
    lang,
    repoUrl,
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

export function dashboardPage(props: {
  lang: Lang;
  user: { avatarUrl: string | null; firstName: string | null };
  data: DashboardData;
  origin: string;
  repoUrl?: string;
}): PageShellProps {
  const { lang, user, data, origin, repoUrl } = props;
  const t = getDict(lang);

  return {
    title: t.dash.title,
    lang,
    repoUrl,
    langToggle: {
      href: lang === "it" ? "/dashboard" : "/it/dashboard",
      lang: lang === "it" ? "en" : "it",
    },
    user,
    children: (
      <>
        <style>{GAVATAR_STYLE}</style>
        <style>{TOAST_STYLE}</style>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: .8rem;">
          <h1 style="margin: .2rem 0;">{t.dash.heading}</h1>
        </div>

        <Flash msg={data.flashMsg} err={data.flashErr} />

        {data.sections.every((s) => s.groups.length === 0) ? (
          <div class="card">
            <p style="margin: 0;">{t.dash.empty}</p>
          </div>
        ) : (
          data.sections.map(
            (section) =>
              section.groups.length > 0 && (
                <>
                  <h2 class="section-title" style="font-size: 1.15rem; margin: 1.6rem 0 .8rem;">
                    {t.dash.sections[section.key]}
                  </h2>
                  <div class="ggrid">
                    {section.groups.map((g) => (
                      <GroupCard group={g} origin={origin} lang={lang} t={t} />
                    ))}
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
}
