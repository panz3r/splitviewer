# Contributing to SplitViewer

Thanks for your interest in contributing! SplitViewer is a community tool for
publishing read-only, privacy-first dashboards of Splitwise group debts.

> **Not affiliated with Splitwise** — we only use their public API. "Splitwise" is
> a trademark of its respective owner.

## Development setup

Prerequisites: Node 18+ (24 recommended) and a Cloudflare account (the `wrangler`
CLI is a local dependency).

```bash
npm run setup-local   # .dev.vars with fresh keys + local D1 schema (idempotent)
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
  emails/ids/avatars/invite links. If you add a feature, add a test that scans
  the output for sensitive strings.
- **All Cloudflare resources must be created with `jurisdiction: eu`** — this is a
  project compliance requirement. Concretely: `wrangler d1 create splitviewer --jurisdiction eu`
  (if a resource type's `--jurisdiction` flag doesn't exist, flag it before creating).
- **Secrets and deployment details never live in the repo.** Dev secrets go to
  `.dev.vars` (gitignored; `.dev.vars.example` is the committed template), production
  uses `wrangler secret put`. `wrangler.jsonc` is gitignored too — it carries your
  `database_id` + PROD client id; `wrangler.example.jsonc` is the template. Outbound
  failure logs stay terse — never log tokens, cookies, or OAuth payloads.
- **Behavior contracts live in `plans/refactor-mvc.md`** (privacy wall, multi-currency,
  instant revocation, stale-while-revalidate, cookie `Secure` on http://localhost,
  Hono registration order, EU jurisdiction). Changing one of those requires a test
  that pins it.
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
   and on `main` (`.github/workflows/ci.yml`).

## CI & release

- **CI** (`.github/workflows/ci.yml`): every PR and push to `main` runs both
  typechecks + the full vitest suite. No secrets required — the workflow seeds
  `wrangler.jsonc` from the committed template and generates throwaway keys for
  `.dev.vars` (`bash scripts/setup-local.sh --yes`).
- **Release** (`.github/workflows/release.yml`): pushing a tag `v*` runs the same
  checks, then deploys to Cloudflare Workers **and records a `prod` deployment in
  the repo's Deployments view**, plus publishes a **GitHub Release** with generated
  notes. Requires these **repository secrets**:
  | Secret | Value |
  |---|---|
  | `CLOUDFLARE_API_TOKEN` | API token with Workers Scripts:Edit (+ D1:Edit); create at dash.cloudflare.com → My Profile → API Tokens |
  | `D1_DATABASE_ID` | the `database_id` of your production splitviewer D1 |
  | `SPLITWISE_CLIENT_ID` | your PROD Splitwise OAuth app's client id |
  | `CLOUDFLARE_ACCOUNT_ID` | *(optional)* needed only if the API token can access multiple accounts |

  The worker's secrets (`TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`,
  `SPLITWISE_CLIENT_SECRET`) are **not** touched by deploys — set them once with
  `wrangler secret put` (see README).
- To cut a release: `git tag vX.Y.Z && git push origin vX.Y.Z` — CI checks, deploys
  to prod, records the deployment, and publishes the GitHub Release. Optional:
  protect the `prod` environment (Settings → Environments → required reviewers)
  for a manual approval gate. `npm run deploy`
  stays available for manual deploys from a configured checkout.

## Reporting bugs / security

Open an issue at https://github.com/panz3r/splitviewer/issues. For anything you'd
consider sensitive (e.g. a data-leak path), please say so in the issue title —
the app holds no plaintext secrets, but we still treat leak reports as urgent.
