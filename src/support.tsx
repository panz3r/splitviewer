// Support page: FAQ, privacy explainer, abuse/takedown path.
import { Hono } from "hono";
import { PageShell, REPO_ISSUES_URL, REPO_URL } from "./ui/components";
import type { AppEnv } from "./types";

export const supportRoutes = new Hono<AppEnv>()

  .get("/support", (c) => {
    return c.html(
      <PageShell
        title="Support — SplitViewer"
        description="FAQ, privacy details, and how to report a problem with a SplitViewer share link."
      >
        <h1 style="margin-top: 0;">Support</h1>

        <div class="card">
          <h2 style="margin-top: 0;">How it works, in one paragraph</h2>
          <p>
            A SplitViewer organizer connects their Splitwise account, picks a group,
            and gets a public link. Anyone with that link sees a read-only dashboard of
            open debts — <strong>first names and last initials only</strong> — grouped by
            currency, refreshed automatically roughly every 7 minutes while people open it.
            The organizer can revoke the link at any time; revocation is instant.
          </p>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">FAQ</h2>
          <dl>
            <dt><strong>Is my group public?</strong></dt>
            <dd>
              Only if you create a share link for it. Creating or revoking a link is
              always under your control from <a href="/dashboard">your dashboard</a>.
            </dd>

            <dt><strong>Do viewers need a Splitwise account?</strong></dt>
            <dd>No. The public page works for anyone with the link, including crawlers and messenger previews.</dd>

            <dt><strong>What exactly is shown?</strong></dt>
            <dd>Group name; open settlements as “First Name L. → First Name L.” with the amount; the currency of each block.</dd>

            <dt><strong>What is never shown?</strong></dt>
            <dd>
              Emails, avatars, full surnames, member ids, expense descriptions or
              receipts, invite links, or anything else from your Splitwise account. The
              stored snapshot contains only sanitized labels — nothing sensitive is
              persisted.
            </dd>

            <dt><strong>How do I revoke a dashboard?</strong></dt>
            <dd>
              Open your dashboard and press “Revoke”. The page, its cached snapshot, and
              the OG image stop responding immediately. Old links don’t get re-activated
              by re-sharing — you get a fresh link each time.
            </dd>

            <dt><strong>My Splitwise connection expired — what now?</strong></dt>
            <dd>
              Open your dashboard; if it says “connection expired”, press reconnect to
              authorize again. Public pages keep serving the last snapshot in the
              meantime.
            </dd>

            <dt><strong>Is SplitViewer affiliated with Splitwise?</strong></dt>
            <dd>
              No. SplitViewer is an independent, open-source tool that uses
              Splitwise’s public API. Splitwise is a trademark of its respective owner.
            </dd>

            <dt><strong>Where is the data stored?</strong></dt>
            <dd>
              In a Cloudflare D1 database restricted to <strong>European Union</strong>{" "}
              jurisdiction (including Europe-only storage regions).
            </dd>
          </dl>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">Report a problem or request a takedown</h2>
          <p>
            Found a link that shouldn’t be public, a bug, or anything else wrong? Please
            open an issue:{" "}
            <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
              {REPO_ISSUES_URL}
            </a>
            . Share owners can always revoke instantly themselves from the dashboard.
          </p>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">Project &amp; roadmap</h2>
          <p>
            Source &amp; docs:{" "}
            <a href={REPO_URL} target="_blank" rel="noopener">
              {REPO_URL}
            </a>
            . Want to help? See the contributing guide. Currently on the roadmap:
            dashboard UX polish, multi-language support (starting with Italian), and
            long-term link management features.
          </p>
        </div>
      </PageShell>,
    );
  });
