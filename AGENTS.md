# SplitViewer — agent notes

Guidance for coding agents working in this repo. The committed docs below are the
source of truth for setup and workflow; this file adds only what they don't cover
(gotchas, hard rules, where things live). No history or status logs here — the git
log is the changelog.

## Where to look (committed docs)

- **`CONTRIBUTING.md`** — local setup, code layout, ground rules + behavior
  contracts, CI/release/Dependabot pipeline, troubleshooting.
- **`docs/architecture.md`** — one-page MVC layer map, dependency direction, key
  DTOs, invariants.
- **`README.md`** — product overview, quickstart, self-hosting walkthrough,
  privacy model, license (LGPL-3.0-only).
- **`SUPPORT.md`** — user support, FAQ, report/takedown flow.
- **`.github/workflows/`** — `ci.yml` (typecheck + tests on PRs/main, Dependabot
  auto-merge), `release-prep.yml` (version bump → tag → pipeline), `release.yml`
  (checks → Cloudflare deploy → GitHub Release → `prod` deployment record),
  `verify-lockfile.yml` (GitHub Actions are SHA-locked; run `gh actions-lock`
  after adding/changing an action).

## Stack

Cloudflare Workers + Hono (SSR JSX, no client JS on public pages), Cloudflare D1
(EU jurisdiction), `@cf-wasm/og` for OG images, AES-256-GCM via Web Crypto,
vitest with the Cloudflare workers plugin. Tests live by layer in
`test/unit|integration|infra/` with in-memory fakes in `test/fakes/`.

## Hard rules (details in CONTRIBUTING.md)

1. **Privacy wall**: `/p/:slug` renders first name + last initial only. Never
   expose emails, avatars, full surnames, member ids, or itemized data anywhere,
   including JSON payloads and cached snapshots (`src/domain/sanitizeService.ts`
   is the only sanctioned source of public content).
2. **Multi-currency**: debts are grouped by `currency_code` — separate blocks per
   currency, never blended or converted.
3. **EU jurisdiction**: every Cloudflare resource is created with
   `--jurisdiction eu` (`d1 create`, `kv namespace create`, `r2 bucket create -J`).
   Workers themselves run on the global edge — that is not a violation. If a
   resource type has no `--jurisdiction` flag, flag it before creating anything.
4. **Secrets**: `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`,
   `SPLITWISE_CLIENT_SECRET` are wrangler secrets (`.dev.vars` locally), never in
   code, config, or logs. In-app repo links come from the `REPO_URL` wrangler var
   (`src/lib/links.ts`).
5. **Tests by layer**: service logic → `test/unit/` against the in-memory fakes;
   HTTP behavior → `test/integration/` through the worker; D1/crypto guarantees →
   `test/infra/`. New code without a layer-appropriate test is incomplete.
6. **i18n**: copy lives only in `src/i18n/{en,it}.json`; the `Dict` type is
   derived from `en.json` (compile-enforced key parity) with runtime parity
   checks in `test/i18n.test.ts`.

## Gotchas

- **hono/jsx escapes string children**: inline `<script>`/`<style>` content MUST
  go through `dangerouslySetInnerHTML` / unquoted CSS (`src/ui/dashboardPage.tsx`,
  `src/ui/styles.ts`).
- **DOCTYPE is not automatic**: PageShell emits it via `raw()`.
- **Hono composition is registration-ordered**: middleware (i18n, rate limits,
  sessions) must be registered before the routes that depend on them
  (`src/app.ts`).
- **hono/jwt**: `verify(token, secret, "HS256")` — the third argument is
  required; payload types need a string index signature (`src/lib/jwt-types.ts`);
  `verify` throws on bad signature/expiry, and the session helpers turn that
  into `null`.
- **Sign sessions with the stored row id**: always create/login users through
  `UsersRepo.upsert` (`src/repositories/usersRepo.ts`) — a freshly generated
  UUID would create sessions pointing at a nonexistent user.
- **OG rendering** (`src/controllers/og.tsx`, `exampleCard.tsx`) requires
  `cache.setExecutionContext()` before the first render or it crashes.
- **App icon**: `src/ui/icon.tsx` must stay in sync with `assets/icon.svg` (the
  design source). After artwork changes run `node scripts/generate-icons.mjs`
  (regenerates the committed apple-touch PNG via `@cf-wasm/resvg`, already in
  the dependency tree). Favicon routes: `src/controllers/assets.tsx`.
- **Tests**: pin clocks explicitly in freshness/boundary assertions — never rely
  on the default wall clock. Never run two `npm test` instances at once (shared
  `.wrangler` state causes phantom failures). Migrations are auto-applied in
  tests via the `TEST_MIGRATIONS` binding.
- **Cookies**: `Secure` derives from the request protocol (Safari refuses Secure
  cookies on `http://localhost`).
- **Local D1 state is keyed by `database_id`**: recreating the database — even
  with the same name — orphans local migrations until
  `npx wrangler d1 migrations apply DB --local` is re-run.
- **wrangler.jsonc**: adding a var/binding requires `npm run cf-typegen`
  (changing a value doesn't). The file is gitignored; `wrangler.example.jsonc`
  is the template.
