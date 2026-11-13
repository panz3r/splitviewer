// Shared UI components (hono/jsx). Every page renders through PageShell so
// tokens/headers/footers stay consistent across routes.
import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { APP_STYLE } from "./styles";
import { getDict, type Lang } from "../i18n";
import { DEFAULT_REPO_URL, repoLinks } from "../lib/links";
import { LogoIcon } from "./icon";

export { DEFAULT_REPO_URL };

/** PageShell footer links come from the configured repo (REPO_URL wrangler var). */
export { repoLinks } from "../lib/links";
export type { RepoLinks } from "../lib/links";

export interface PageShellProps {
  title: string;
  description?: string;
  /** Extra <head> content (e.g. OG meta), rendered inside the real head. */
  head?: any;
  /** Page language: sets <html lang> + header/footer copy. Default "en". */
  lang?: Lang;
  /** Language toggle rendered in the header — a flag icon linking to the alt version. */
  langToggle?: { href: string; lang: Lang };
  /** hreflang alternates for SEO (absolute URLs). x-default → EN is added automatically. */
  hreflang?: Array<{ lang: Lang; href: string }>;
  /** Repo root for footer links (defaults to the upstream repo). */
  repoUrl?: string;
  /**
   * Session widget for the header (avatar + first name + Log-out menu, native
   * <details> popup so it works without JS).
   */
  user?: { avatarUrl: string | null; firstName: string | null };
  children?: any;
  hideNav?: boolean;
}

export const PageShell: FC<PageShellProps> = (props) => {
  const {
    title,
    description = "Shareable, privacy-first public dashboards for Splitwise groups.",
    head,
    lang = "en",
    langToggle,
    hreflang,
    repoUrl,
    user,
    children,
    hideNav,
  } = props;
  const t = getDict(lang);
  const initial = (user?.firstName?.trim().charAt(0) || "?").toUpperCase();
  const logoHref = lang === "it" ? "/it" : "/";
  const toggleAria = lang === "it" ? "English" : "Italiano";
  // <!DOCTYPE html> is NOT added automatically by hono/jsx — without it every
  // page renders in Quirks Mode (layout bugs, console issues).
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang={lang}>
      <head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Splitwise's own type stack (their attributions): Montserrat display, Lato body */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Lato:wght@400;700&display=swap"
        />
        {hreflang?.map((alt) => (
          <link rel="alternate" hreflang={alt.lang} href={alt.href} />
        ))}
        {hreflang && hreflang.length > 0 ? (
          <link
            rel="alternate"
            hreflang="x-default"
            href={hreflang.find((alt) => alt.lang === "en")?.href ?? hreflang[0].href}
          />
        ) : null}
        {head}
        <style>{APP_STYLE}</style>
      </head>
      <body>
        <div class="shell">
          {hideNav ? (
            null
          ) : (
            <header class="topbar">
              <div class="container">
                <a class="logo" href={logoHref}>
                  <LogoIcon />
                  SplitViewer
                </a>
                <div class="navlinks">
                  {/* Anonymous pages have no account menu — keep the language
                      flag in the header there. Logged-in pages host it inside
                      the user menu (see menu-pop below). */}
                  {!user && langToggle ? (
                    <a
                      class="lang-toggle"
                      href={langToggle.href}
                      hreflang={langToggle.lang}
                      aria-label={t.nav.langSwitchAria}
                      title={toggleAria}
                    >
                      <FlagIcon lang={langToggle.lang} />
                    </a>
                  ) : null}
                  {user ? (
                    <details class="usermenu">
                      <summary aria-label="Account menu">
                        {user.avatarUrl ? (
                          <img class="avatar" src={user.avatarUrl} alt="" />
                        ) : (
                          <span class="avatar avatar--fallback" aria-hidden="true">
                            {initial}
                          </span>
                        )}
                        {user.firstName ? (
                          <span class="uname">{user.firstName}</span>
                        ) : null}
                        <span class="caret" aria-hidden="true">▾</span>
                      </summary>
                      <div class="menu-pop">
                        {langToggle ? (
                          <a
                            class="menu-item"
                            href={langToggle.href}
                            hreflang={langToggle.lang}
                            aria-label={t.nav.langSwitchAria}
                            title={toggleAria}
                          >
                            <FlagIcon lang={langToggle.lang} />
                            <span>{toggleAria}</span>
                          </a>
                        ) : null}
                        <hr class="menu-sep" />
                        <form method="post" action="/auth/logout">
                          <button class="btn" type="submit">Log out</button>
                        </form>
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </header>
          )}
          <main class="pagepad">
            <div class="container">{children}</div>
          </main>
          <footer class="footer">
            <div class="container">
              <span>{t.footer.notAffiliated}</span>
              <span class="navlinks">
                <a href={lang === "it" ? "/it/support" : "/support"}>{t.nav.support}</a>
                <a href={repoLinks(repoUrl).report} target="_blank" rel="noopener">
                  {t.nav.reportIssue}
                </a>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
    </>
  );
};

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <p class={`flash${err ? " flash--err" : ""}`}>{err ?? msg}</p>;
}

export function Badge({ on }: { on: boolean }) {
  return <span class={`badge ${on ? "" : "badge--off"}`}>{on ? "public" : "off"}</span>;
}

/** Tiny inline-SVG flags (Windows renders flag emoji as letter codes, so SVGs
 * are the reliable cross-platform choice). */
export function FlagIcon({ lang }: { lang: Lang }) {
  if (lang === "it") {
    return (
      <svg class="flag" viewBox="0 0 3 2" width="20" height="14" aria-hidden="true">
        <rect width="1" height="2" fill="#009246" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ce2b37" />
      </svg>
    );
  }
  // Simplified Union Jack
  return (
    <svg class="flag" viewBox="0 0 60 30" width="20" height="14" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2.5" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6" />
    </svg>
  );
}
