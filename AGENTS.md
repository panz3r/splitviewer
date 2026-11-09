# SplitViewer — agent notes

## Status

- **`v0.1.0-mvp` shipped on `main`** (2026-11-09, all phase branches merged & deleted): Cloudflare Workers + Hono app — Splitwise OAuth, organizer dashboard, public sanitized dashboards with SWR cache, OG images, rate limiting. Deployed at https://splitviewer.mattiapanzeri.workers.dev (worker version `16286f9b`). Live feature: share a group via dashboard → public page + messenger unfurl.
- Hard-won gotchas (see per-phase notes in `plans/` for full context): cookies derive `Secure` from the request protocol (Safari refuses it on http://localhost); sign sessions with the stored row id — always use `upsertUser()` (`src/lib/users.ts`); OG rendering requires `cache.setExecutionContext()` first (`src/og.tsx`).
- `plans/Splitwise Public Dashboards Implementation Plan.md` is the source of truth for architecture, phases, and scope. Per-phase execution records live in `plans/` (gitignored, not committed).
- Stack as built: Cloudflare Workers + Hono SSR, Cloudflare D1 (EU jurisdiction), `@cf-wasm/og` for OG images, AES-256-GCM via Web Crypto, vitest workers integration (70 tests).

## Non-obvious product constraints

These are verbatim requirements from the plan, easy to miss while coding:

- **Privacy is the core feature**: the public view (`/p/:slug`) must show only First Name + Last Initial (e.g. "Marco D."). Never expose emails, avatars, full surnames, or itemized receipt data anywhere, including JSON payloads.
- **Multi-currency**: group `simplified_debts` by `currency_code` — separate cards per currency, never blend/convert amounts.
- **Splitwise OAuth tokens are secrets at rest**: encrypt before storing in D1; the 32-byte hex key lives in the `TOKEN_ENCRYPTION_KEY` wrangler secret, never in code or config files.
- **Caching is stale-while-revalidate**: serve D1 `group_cache` if fresh (< ~7 min); refresh via `executionCtx.waitUntil()`; fall back to stale cache if the Splitwise API call fails.
- **Revocation must be instant**: deactivating a share means `/p/:slug` and `/p/:slug/og.png` return 404 immediately, not after cache expiry.
- **Crawlers matter**: OG meta tags must render on bare GET (no JS), and `/p/:slug/og.png` returns a 1200×630 PNG. Verify with `curl -A "Twitterbot/1.0"`.

## Cloudflare compliance: EU jurisdiction only (user requirement)

- **Every Cloudflare resource must be created/recreated with `jurisdiction: eu`.** Verified command surface (wrangler 4.158): D1 `wrangler d1 create <name> --jurisdiction eu`; KV `wrangler kv namespace create <name> --jurisdiction eu` (and add `"jurisdiction": "eu"` to its wrangler.jsonc binding for local dev); R2 `wrangler r2 bucket create <name> -J eu`. If `--jurisdiction` is set, `--location` hints are ignored.
- The prod D1 was recreated on 2026-11-09 with `jurisdiction: eu` (`d1 info` confirms `jurisdiction │ eu`).
- Workers themselves run on the global edge (no per-Worker jurisdiction flag). If EU-only request processing is ever required, revisit Cloudflare's jurisdiction options then — don't assume "EU D1" constrains worker placement.
- Before creating any new Cloudflare resource, check `--jurisdiction` exists for that resource type in `--help`; if it doesn't support jurisdiction, flag it before creating.

## Setup

- Scaffold source: `npm create hono@latest -- --template cloudflare-workers` (C3's `--framework=hono` path ignores its flags as of v2.74.9 — don't bother with it).
- `wrangler.jsonc` has D1 binding `DB` → database `splitviewer` (`database_id` filled, DB created). Existing prod secret: `TOKEN_ENCRYPTION_KEY` (fresh key, differs from local `.dev.vars`).
- Dev/prod use **two separate Splitwise apps** (Splitwise allows one callback URL per app): dev callback `http://localhost:8787/auth/callback`, prod callback `https://splitviewer.mattiapanzeri.workers.dev/auth/callback`. Prod `SPLITWISE_CLIENT_ID` is a wrangler.jsonc var (placeholder committed); `SPLITWISE_CLIENT_SECRET` + `SESSION_SECRET` are secrets (`wrangler secret put` for prod, `.dev.vars` for local).
- hono/jwt gotchas: `verify(token, secret, "HS256")` (3rd arg required); payload types need a string index signature (`src/lib/jwt-types.ts`); `verify` throws on bad sig/expiry — the state/session helpers already turn that into `null`.
- Deployed worker: https://splitviewer.mattiapanzeri.workers.dev (`npx wrangler deploy` to ship; run `npx wrangler d1 migrations apply DB --remote` after any new migration; local counterpart `--local` — **local D1 state is keyed by `database_id`**, so recreating a database — even with the same name — orphans locally-applied migrations until they're re-applied; bit us during the first real OAuth login).
- After any `wrangler.jsonc` change (vars/bindings), re-run `npm run cf-typegen`.
- Local dev secrets live in `.dev.vars` (gitignored): 64-hex-char `TOKEN_ENCRYPTION_KEY`.
- Tests: vitest + `@cloudflare/vitest-plugin` (Cloudflare's new name; `@cloudflare/vitest-pool-workers` is legacy). Migrations auto-applied in tests via a `TEST_MIGRATIONS` binding. Follow the phase order — OAuth (Phase 2) depends on the crypto module (`src/lib/crypto.ts`) and D1 schema (`migrations/0001_init_schema.sql`) from Phase 1.
