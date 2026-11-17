# Contributing to SplitViewer

Thanks for your interest in contributing! SplitViewer is a community tool for
publishing read-only, privacy-first dashboards of Splitwise group debts.

> **Not affiliated with Splitwise** — we only use their public API. "Splitwise" is
> a trademark of its respective owner.

## Development setup

Prerequisites: Node 22.12+ (24 recommended — what CI runs) and a Cloudflare account (the `wrangler`
CLI is a local dependency).

```bash
npm run setup-local   # .dev.vars with fresh keys + local D1 schema (idempotent)
npm run hooks:install # pre-commit secret scan (needs betterleaks: brew install betterleaks)
npm run dev           # http://localhost:8787
npm test              # vitest with the Cloudflare Workers pool
npx tsc -p tsconfig.json && npx tsc -p test/tsconfig.json
npx wrangler deploy   # ship it
```

`npm run setup-local` wraps the manual steps (equivalent to):

```bash
cp .dev.vars.example .dev.vars            # then fill in the values
cp wrangler.example.jsonc wrangler.jsonc  # only if missing (gitignored, deployment-specific)
npx wrangler d1 migrations apply DB --local
```

Splitwise OAuth for local testing: Splitwise allows **one callback URL per app**, so
register a *dev* app (https://secure.splitwise.com/apps) whose single registered
callback is `http://localhost:8787/auth/callback`, and put its id + secret in
`.dev.vars`. Placeholder credentials are fine without OAuth (`/auth/login` → 503).

Production setup (D1 in **EU jurisdiction**, secrets, prod Splitwise app) is
documented in the [README](README.md).

## Code layout (strict MVC)

One-page map with the dependency rules: [`docs/architecture.md`](docs/architecture.md).

```
src/controllers/   thin Hono routers (HTTP wiring only — no JSX, no SQL, no lang logic)
src/domain/        business logic: services, framework-agnostic, no env/Context/fetch
src/repositories/  the only D1 SQL: interface + D1 impl + in-memory impl per repo
src/ui/            JSX-only page components (props in → JSX out)
src/middleware/    session (cookies → user) + i18n (path → lang)
src/lib/           transport/infra: crypto, splitwise client, rate limiting
src/i18n/          copy in en.json/it.json; Dict type derived (key parity compile-enforced)
src/wiring.ts      the composition root: env → repositories → services
```

**Dependency direction:** controllers → wiring → domain → repositories. Nothing in
`domain/` may import Hono types, `Context`, `env.DB`, or `fetch`; services receive
repositories/clients via parameters. Presentation never calls services.

## Ground rules

- **Privacy is the core feature.** Public content may only ever originate from
  sanitized snapshots (`src/domain/sanitizeService.ts`): first name + last initial, no
  emails/ids/avatars/invite links. Splitwise's `first_name` is free text and is
  never trusted verbatim (first word only; email-like or letterless values
  render as "Someone"). If you add a feature, add a test that scans
  the output for sensitive strings.
- **All Cloudflare resources must be created with `jurisdiction: eu`** — this is a
  project compliance requirement. Concretely: `wrangler d1 create splitviewer --jurisdiction eu`
  (if a resource type's `--jurisdiction` flag doesn't exist, flag it before creating).
- **Secrets and deployment details never live in the repo.** Dev secrets go to
  `.dev.vars` (gitignored; `.dev.vars.example` is the committed template), production
  uses `wrangler secret put`. `wrangler.jsonc` is gitignored too — it carries your
  `database_id` + PROD client id; `wrangler.example.jsonc` is the template. Outbound
  failure logs stay terse — never log tokens, cookies, or OAuth payloads.
- **Behavior contracts (privacy wall, multi-currency, secrets-at-rest, stale-while-revalidate
  caching, instant revocation, crawler-friendly OG output, cookie `Secure` semantics,
  Hono registration order, EU jurisdiction) are non-negotiable; changing one of them
  requires a test that pins it.** The full list lives in this document (ground rules
  below) and `docs/architecture.md`; the agent-facing copy is in `AGENTS.md`. In short:
  cache serves fresh (< ~7 min) then stale on failure; revocation makes `/p/:slug`
  and its OG image 404 immediately (and drops the cache row); OG meta tags render on
  bare GET (no JS) and `/p/:slug/og.png` returns a 1200×630 PNG — verify with
  `curl -A "Twitterbot/1.0"`.
- **Security headers.** Every response carries a CSP
  (`src/middleware/securityHeaders.ts`): same-origin scripts only, so client JS
  ships as a static asset (`/share.js`), never inline. `hono/csrf` rejects
  cross-origin form posts (tests posting forms must send a same-origin `Origin`).
- **Session revocation.** Sessions embed `users.session_version` (`sv` claim);
  `POST /auth/logout` bumps it, revoking every outstanding session for that user.
  Everything behind `requireSession` is served `Cache-Control: private, no-store`.
- **Tests by layer.** New service logic gets a *unit* test against the in-memory
  fakes (`test/fakes/`); HTTP behavior gets an *integration* test through the worker
  (`test/integration/`); D1/crypto guarantees stay in `test/infra/`.
- **Repo links are deploy-time config.** In-app report/project links resolve from
  the `REPO_URL` wrangler var (`src/lib/links.ts`), defaulting to the upstream
  repo. `npm run setup-local` seeds it from `git remote get-url origin`; the
  release workflow injects `github.server_url/github.repository`, so forks'
  users report to the fork's tracker. Only *adding* vars needs
  `npm run cf-typegen` — changing REPO_URL's value doesn't.
- Working docs (per-phase plans, gotchas) live in `plans/` and are gitignored —
  put durable *consumer* docs in `README.md` / `SUPPORT.md` / `CONTRIBUTING.md`.

## Troubleshooting

- **Orphaned local migrations after recreating D1** — local D1 state is keyed by
  `database_id`, so recreating the database leaves `--local` migrations unapplied.
  Re-run `npx wrangler d1 migrations apply DB --local`.
- **Login broken in Safari on localhost** — cookies derive `Secure` from the request
  protocol; Safari refuses Secure cookies on `http://localhost`. Test at
  `http://localhost:8787` (not https proxies) or use another browser.
- **Two `npm test` runs colliding** — concurrent vitest runs share `.wrangler` local
  state; run them consecutively.
- **Dashboard shows "connection expired"** — the stored Splitwise token was rejected
  (401). Press reconnect, or re-run the OAuth flow. Refresh tokens are rarely issued
  by Splitwise (stored as `""`), so expired tokens keep serving stale public snapshots
  until the owner reconnects.

## Workflow

1. Fork / branch (`feat/...` or `fix/...`).
2. Make the change; add or update tests; keep typecheck + tests green.
3. Open a PR against `main` — GitHub Actions runs typecheck + tests on every PR
   and on `main` (`.github/workflows/ci.yml`), plus a secret scan
   (`.github/workflows/secrets.yml`).

## CI & release

- **CI** (`.github/workflows/ci.yml`): every PR and push to `main` runs both
  typechecks + the full vitest suite. No secrets required — the workflow seeds
  `wrangler.jsonc` from the committed template and generates throwaway keys for
  `.dev.vars` (`bash scripts/setup-local.sh --yes`).
- **GitHub Actions Checks** (`.github/workflows/gh-actions-checks.yml`): PRs and
  pushes to `main` that change `.github/**` verify the action dependency lockfile,
  lint workflows with [actionlint](https://github.com/rhysd/actionlint), and run
  [zizmor](https://docs.zizmor.sh/) on workflows and Dependabot configuration.
  zizmor findings are uploaded to code scanning (Security tab) and do not fail
  the job by themselves. It can also be run manually. Don't make these path-filtered
  jobs required checks without handling skipped runs, which can remain pending.
- **Code scanning & rulesets**: CodeQL default setup (actions +
  JavaScript/TypeScript) runs on PRs and `main`; alerts appear in the Security
  tab. Rulesets block deleting or force-pushing `main` and deleting or moving
  `v*` tags. Don't require PRs, status checks, or code scanning results on
  `main`, or restrict tag creation: these rules also apply to direct pushes,
  and release prep pushes its unchecked bump commit to `main` and creates the
  tag with `GITHUB_TOKEN` (a code-scanning ruleset blocked the v0.2.12 release).
- **Secret scan** (`.github/workflows/secrets.yml`): every PR and push to `main`
  scans the full git history with [betterleaks](https://github.com/betterleaks/betterleaks)
  (pinned release, SHA-256 verified, findings redacted in the log). The same
  check runs locally on staged changes via the `.githooks/pre-commit` hook
  (`npm run hooks:install` links it into `.git/hooks` without touching
  `core.hooksPath`; the hook skips with a warning if betterleaks isn't
  installed). For a false positive, add a `betterleaks:allow` comment on the
  line. To bump betterleaks, update `BETTERLEAKS_VERSION` and
  `BETTERLEAKS_SHA256` in the workflow (Dependabot doesn't track it).
- **Release** (`.github/workflows/release.yml`): pushing a tag `v*` runs the same
  checks, applies pending D1 migrations to production
  (`wrangler d1 migrations apply DB --remote`), then deploys to Cloudflare
  Workers **and records a `prod` deployment in
  the repo's Deployments view**, plus publishes a **GitHub Release** with generated
  notes. Requires this configuration in the **`prod` environment**:
  | Name | Type | Value |
  |---|---|---|
  | `CLOUDFLARE_API_TOKEN` | Secret | API token with Workers Scripts:Edit + D1:Edit (D1 for the migrations step); create at dash.cloudflare.com → My Profile → API Tokens |
  | `D1_DATABASE_ID` | Variable | the `database_id` of your production splitviewer D1 |
  | `SPLITWISE_CLIENT_ID` | Variable | your PROD Splitwise OAuth app's client id |
  | `CLOUDFLARE_ACCOUNT_ID` | Secret | *(optional)* needed only if the API token can access multiple accounts |

  **Migrations must be backward compatible.** They run *before* the new code
  ships, so the previous release keeps serving against the new schema for a
  moment (and stays live if the deploy then fails). "Additive" is not
  automatically safe: before writing a migration, check the SQL of the release
  that is currently live (`src/repositories/`) against the new schema.
  - New columns must be nullable or have a `DEFAULT` — otherwise the live
    code's INSERTs fail.
  - Keep explicit column lists in every `INSERT` and `SELECT` (the repos do
    today). A positional `INSERT INTO t VALUES (...)` breaks as soon as a
    column is added, and `SELECT *` silently changes the row shape.
  - New constraints (`NOT NULL`, `UNIQUE`, `CHECK`, new unique indexes) can
    reject writes the live code still makes.
  - Drop or rename in a later release, once no deployed code uses the old
    shape.

  A failing migration aborts the release before deploy.

  The worker's secrets (`TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`,
  `SPLITWISE_CLIENT_SECRET`) are **not** touched by deploys — set them once with
  `wrangler secret put` (see README).

  **Setting the environment configuration** — either in the web UI
  (*Settings → Environments → prod → Environment secrets / Environment variables*)
  or with the GitHub CLI. Keep deployment configuration scoped to `prod`, not
  duplicated at repository level. Variables are not masked in workflow logs.

  ```bash
  gh secret set CLOUDFLARE_API_TOKEN --env prod   # paste the API token
  gh variable set D1_DATABASE_ID --env prod       # paste the database_id
  gh variable set SPLITWISE_CLIENT_ID --env prod  # paste the PROD app's client id
  gh secret set CLOUDFLARE_ACCOUNT_ID --env prod  # optional — only for multi-account tokens
  ```

  Also enable **Settings → Actions → General → "Allow GitHub Actions to create
  and approve pull requests"** so Dependabot auto-merge can work (see below).

  **Rotating the Splitwise OAuth app** — three coordinated places, learned the
  hard way:
  1. the new app's registered callback must be exactly
     `https://<your-worker-domain>/auth/callback`;
  2. update the `SPLITWISE_CLIENT_ID` **`prod` environment variable** above (the release
     pipeline injects it at deploy time);
  3. re-apply the new secret to the worker:
     `printf '%s' 'NEW_SECRET' | npx wrangler secret put SPLITWISE_CLIENT_SECRET`
     (never `echo` — the trailing newline becomes part of the secret and the
     token exchange fails with `invalid_client`). Then cut a release so the new
     client id deploys; users authorize again via the dashboard's reconnect flow.
- To cut a release: run **Release prep** (Actions → Release prep → Run workflow,
  version without the `v` prefix) — it bumps `package.json` **and the lockfile's
  version fields** (`npm install --package-lock-only --ignore-scripts`), commits, tags, and
  triggers the release pipeline. Manual `git tag vX.Y.Z && git push origin vX.Y.Z`
  also works: the release workflow then syncs both files after deploying.
  Don't "Run workflow" on **Release** itself from a branch — it refuses any
  ref that isn't a `vX.Y.Z` tag.
  Optional: protect the `prod` environment (Settings → Environments → required reviewers)
  for a manual approval gate. `npm run deploy`
  stays available for manual deploys from a configured checkout.
- Dependencies are kept current by **Dependabot** (`.github/dependabot.yml`,
  weekly with a seven-day cooldown for version updates; security updates are
  not delayed): npm minor+patch arrive grouped in one PR, majors and
  GitHub-Actions bumps individually — every PR is validated by CI. Watch the
  coupled pair `wrangler` + `@cloudflare/vitest-plugin` and the wasm modules
  (`@cf-wasm/*`) on major bumps. Dependabot PRs are **auto-merged with squash**
  once CI is green (`fastify/github-action-merge-dependabot`): patch bumps
  for everything, minor bumps for devDependencies only — runtime minors and
  all majors need manual review. This requires the repo setting
  **Settings → Actions → General → "Allow GitHub Actions to create and approve
  pull requests"** to stay on (the action approves before merging; GITHUB_TOKEN
  is blocked from approving PRs otherwise).
- `package.json` has `"private": true` — SplitViewer is an app, not a published
  npm package; the flag prevents accidental publishes.

## Reporting bugs / security

Bugs: open an issue at https://github.com/panz3r/splitviewer/issues.
Security vulnerabilities, data-leak paths, takedown requests, and privacy
concerns must be reported **privately** — see [SECURITY.md](SECURITY.md). Never
post a share link in a public issue.
