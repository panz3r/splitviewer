# SplitViewer — agent notes

## Status

- **Phase 1 code committed on branch `phase-1-setup`** (scaffold + D1 schema + crypto module + tests). Run tests with `npm test` (vitest workers integration, uses `cloudflare:workers`/`cloudflare:test`); typecheck needs both `npx tsc -p tsconfig.json` and `-p test/tsconfig.json`.
- `plans/Splitwise Public Dashboards Implementation Plan.md` is the source of truth for architecture, phases, and scope. Read it before implementing anything; per-phase execution plans live in `plans/` (gitignored, not committed).
- Planned stack (per plan): Cloudflare Workers + Hono (SSR via hono/jsx), Cloudflare D1, Satori + @resvg/resvg-wasm for OG images, AES-256-GCM via Web Crypto for token encryption.

## Non-obvious product constraints

These are verbatim requirements from the plan, easy to miss while coding:

- **Privacy is the core feature**: the public view (`/p/:slug`) must show only First Name + Last Initial (e.g. "Marco D."). Never expose emails, avatars, full surnames, or itemized receipt data anywhere, including JSON payloads.
- **Multi-currency**: group `simplified_debts` by `currency_code` — separate cards per currency, never blend/convert amounts.
- **Splitwise OAuth tokens are secrets at rest**: encrypt before storing in D1; the 32-byte hex key lives in the `TOKEN_ENCRYPTION_KEY` wrangler secret, never in code or config files.
- **Caching is stale-while-revalidate**: serve D1 `group_cache` if fresh (< ~7 min); refresh via `executionCtx.waitUntil()`; fall back to stale cache if the Splitwise API call fails.
- **Revocation must be instant**: deactivating a share means `/p/:slug` and `/p/:slug/og.png` return 404 immediately, not after cache expiry.
- **Crawlers matter**: OG meta tags must render on bare GET (no JS), and `/p/:slug/og.png` returns a 1200×630 PNG. Verify with `curl -A "Twitterbot/1.0"`.

## Setup

- Scaffold source: `npm create hono@latest -- --template cloudflare-workers` (C3's `--framework=hono` path ignores its flags as of v2.74.9 — don't bother with it).
- `wrangler.jsonc` has D1 binding `DB` with an empty `database_id` (works locally). Before any remote deploy: `wrangler d1 create splitviewer`, paste the id, run `npx wrangler d1 migrations apply DB --remote`, and set the prod secret `wrangler secret put TOKEN_ENCRYPTION_KEY`.
- Local dev secrets live in `.dev.vars` (gitignored): 64-hex-char `TOKEN_ENCRYPTION_KEY`.
- Tests: vitest + `@cloudflare/vitest-plugin` (Cloudflare's new name; `@cloudflare/vitest-pool-workers` is legacy). Migrations auto-applied in tests via a `TEST_MIGRATIONS` binding. Follow the phase order — OAuth (Phase 2) depends on the crypto module (`src/lib/crypto.ts`) and D1 schema (`migrations/0001_init_schema.sql`) from Phase 1.
