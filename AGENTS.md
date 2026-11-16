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
  auto-merge), `secrets.yml` (betterleaks history scan; local twin is
  `.githooks/pre-commit`, installed by `npm run hooks:install`), `release-prep.yml` (version bump → tag → pipeline), `release.yml`
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

- **hono/jsx escapes string children**: inline `<style>` content MUST be
  unquoted CSS (`src/ui/styles.ts`).
- **CSP forbids inline scripts** (`src/middleware/securityHeaders.ts`): client
  JS is served as a same-origin asset (`src/ui/shareScript.ts` →
  `/share.js`). New external origins (images, fonts) need a CSP update.
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
  UUID would create sessions pointing at a nonexistent user. Sessions also
  carry `users.session_version` (`sv`); logout bumps it to revoke them.
- **OG rendering** (`src/controllers/og.tsx`, `exampleCard.tsx`) requires
  `cache.setExecutionContext()` before the first render or it crashes.
- **satori advisory accepted** (GHSA-wx4j-mvgx-mqwp, fixed in satori 0.33.5 —
  but `@cf-wasm/satori@0.4.2` hard-pins `satori@0.32.0` and is incompatible with
  satori ≥ 0.33's harfbuzz internals; npm `overrides` break OG rendering). Risk
  accepted because output is rasterized to PNG server-side and inputs are
  masked labels — see the note in `src/controllers/og.tsx`. Do not try to
  override satori again without moving off `@cf-wasm/satori`.
- **App icon**: `src/ui/icon.tsx` must stay in sync with `assets/icon.svg` (the
  design source). After artwork changes run `node scripts/generate-icons.mjs`
  (regenerates the committed apple-touch PNG via `@cf-wasm/resvg`, already in
  the dependency tree). Favicon routes: `src/controllers/assets.tsx`.
- **Fonts are self-hosted** (`assets/fonts/`, OFL licenses alongside): after
  changing a WOFF2 file run `node scripts/generate-fonts.mjs` to regenerate
  `src/ui/fontAssets.ts` (served at `/fonts/*`, `@font-face` in `APP_STYLE`).
  Don't reintroduce a font CDN — it would leak visitor IPs and need CSP changes.
- **Tests**: pin clocks explicitly in freshness/boundary assertions — never rely
  on the default wall clock. Never run two `npm test` instances at once (shared
  `.wrangler` state causes phantom failures). Migrations are auto-applied in
  tests via the `TEST_MIGRATIONS` binding.
- **Cookies**: `Secure` derives from the request protocol (Safari refuses Secure
  cookies on `http://localhost`).
- **Local D1 state is keyed by `database_id`**: recreating the database — even
  with the same name — orphans local migrations until
  `npx wrangler d1 migrations apply DB --local` is re-run.
- **OAuth rotation**: when rotating the Splitwise app, the registered callback
  must match the worker's `/auth/callback` exactly, and
  `SPLITWISE_CLIENT_SECRET` must be re-applied to the worker. A wrong pair
  surfaces as `invalid_client` at token exchange (some providers answer 400,
  not 401) — apply secrets with `printf '%s' 'SECRET' | npx wrangler secret
  put …` (`echo` appends a newline that becomes part of the secret). Token
  exchange failures log `status (error — description)` server-side
  (`wrangler tail`); the response body is never logged raw and clients stay
  terse.
- **wrangler.jsonc**: adding a var/binding requires `npm run cf-typegen`
  (changing a value doesn't). The file is gitignored; `wrangler.example.jsonc`
  is the template.
