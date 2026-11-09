# SplitViewer — agent notes

## Status

- **Greenfield repo**: scaffolding in progress on branch `phase-1-setup` (per `plans/phase-1-setup.md`). No committed source yet.
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

## Setup (when scaffolding)

- Plan prescribes: `npm create cloudflare@latest -- --template hono`. Verified concrete command (scaffold into temp dir, repo root is non-empty): `npx create-cloudflare@latest splitviewer-scaffold -- --type=web-app --framework=hono --ts --no-git --no-deploy`, then copy config/src into repo root without overwriting README/LICENSE/.gitignore/AGENTS.md. Details in `plans/phase-1-setup.md`. Follow the plan's phase order — OAuth (Phase 2) depends on the crypto module and D1 schema from Phase 1.
