// Shared UI components (hono/jsx). Every page renders through PageShell so
// tokens/headers/footers stay consistent across routes.
import type { FC } from "hono/jsx";
import { APP_STYLE } from "./styles";

/** Single URL constant; flip here if the repo moves. */
export const REPO_URL = "https://github.com/panz3r/splitviewer";
export const REPO_ISSUES_URL = `${REPO_URL}/issues`;

interface PageShellProps {
  title: string;
  description?: string;
  /** Extra <head> content (e.g. OG meta), rendered inside the real head. */
  head?: any;
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
    user,
    children,
    hideNav,
  } = props;
  const initial = (user?.firstName?.trim().charAt(0) || "?").toUpperCase();
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Splitwise's own type stack (their attributions): Montserrat display, Lato body */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Lato:wght@400;700&display=swap"
        />
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
                <a class="logo" href="/">
                  <span class="leaf" aria-hidden="true">
                    ⇄
                  </span>
                  SplitViewer
                </a>
                <div class="navlinks">
                  <a href="/support">Support</a>
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
              <span>
                Not affiliated with Splitwise · Built with their public API
              </span>
              <span class="navlinks">
                <a href="/support">Support</a>
                <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
                  Report an issue
                </a>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
};

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <p class={`flash${err ? " flash--err" : ""}`}>{err ?? msg}</p>;
}

export function Badge({ on }: { on: boolean }) {
  return <span class={`badge ${on ? "" : "badge--off"}`}>{on ? "public" : "off"}</span>;
}
