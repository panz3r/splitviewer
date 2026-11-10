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
  children?: any;
  hideNav?: boolean;
}

export const PageShell: FC<PageShellProps> = (props) => {
  const {
    title,
    description = "Shareable, privacy-first public dashboards for Splitwise groups.",
    head,
    children,
    hideNav,
  } = props;
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        {head}
        <style>{APP_STYLE}</style>
      </head>
      <body>
        <div class="shell">
          {hideNav ? null : (
            <header class="topbar">
              <div class="container">
                <a class="logo" href="/">
                  <span class="leaf" aria-hidden="true">
                    ⇄
                  </span>
                  SplitViewer
                </a>
                <nav class="navlinks" aria-label="Main">
                  <a href="/support">Support</a>
                </nav>
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
