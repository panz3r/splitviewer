// Homepage: value prop + how-it-works + privacy pitch, with a live fake-data
// example card (randomized per request via /example-card.png).
import { Hono } from 'hono'
import { getSessionUserId } from './lib/session'
import { PageShell, REPO_ISSUES_URL } from './ui/components'
import type { AppEnv } from './types'

export const homeRoutes = new Hono<AppEnv>()

homeRoutes.get('/', async (c) => {
  const userId = await getSessionUserId(c)
  if (userId) {
    // Authenticated users should never see the landing page again.
    return c.redirect('/dashboard', 302)
  }

  return c.html(
    <PageShell
      title="SplitViewer — shareable Splitwise group dashboards"
      description="Recap your Splitwise group debts on a public, read-only page. First names only, no viewer accounts, revocable in one click."
    >
      <section class="hero">
        <h1>Recap your group debts, then just share one link.</h1>
        <p>
          SplitViewer lets you publish a read-only dashboard of your Splitwise group:
          who owes whom, grouped by currency — with <strong>first names only</strong>,
          and revocable in one click.
        </p>
        <div class="cta">
          <a class="btn btn--primary" href="/auth/login">
            Continue with Splitwise
          </a>
          <a class="btn" href="#example">
            See a sample dashboard
          </a>
        </div>
      </section>

      <h2 class="section-title">How it works</h2>
      <div class="steps">
        <div class="card step">
          <span class="n">1</span>
          <h3>Connect Splitwise</h3>
          <p>Sign in once with your Splitwise account. We only read group balances.</p>
        </div>
        <div class="card step">
          <span class="n">2</span>
          <h3>Pick a group</h3>
          <p>Choose which of your groups gets a public dashboard — private details stay private.</p>
        </div>
        <div class="card step">
          <span class="n">3</span>
          <h3>Share one link</h3>
          <p>Anyone with the link opens a clean dashboard — no app, no account, automatically refreshed.</p>
        </div>
      </div>

      <h2 id="example" class="section-title">
        A sample dashboard
      </h2>
      <div class="card">
        <img
          src="/example-card.png"
          alt="Sample SplitViewer dashboard card with fake data"
          width="1200"
          height="630"
        />
        <p class="muted small" style="margin-top: .8rem;">
          Sample with fake data — regenerated on each visit, so you'll see different names
          and amounts each time.
        </p>
      </div>

      <h2 class="section-title">Privacy first</h2>
      <div class="card">
        <ul class="checklist">
          <li>
            Public pages show <strong>first names and last initials only</strong> — never
            emails, avatars, or full surnames.
          </li>
          <li>Splitwise tokens are <strong>encrypted at rest</strong> (AES-256-GCM).</li>
          <li>
            The cached snapshot stores <strong>only sanitized labels</strong> — nothing
            sensitive is persisted anywhere.
          </li>
          <li>
            <strong>One click revokes</strong> a dashboard: old links stop working instantly.
          </li>
          <li>EU-hosted data storage (Cloudflare D1, European Union jurisdiction).</li>
        </ul>
        <p class="muted small" style="margin-top: .8rem;">
          Questions? The <a href="/support">support page</a> has the FAQ, and{" "}
          <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
            GitHub issues
          </a>{" "}
          take bug reports.
        </p>
      </div>
    </PageShell>,
  )
})
