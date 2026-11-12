# SplitViewer

> Shareable public dashboards for [Splitwise](https://splitwise.com) groups.

SplitViewer lets a group **organizer** publish a read-only, anonymized snapshot of their
Splitwise group debts behind a short public link (`/p/<slug>`) that unfurls nicely in
messengers (Telegram, WhatsApp, iMessage, Slack, X) with a generated OG card.

**See it live:** https://splitviewer.mattiapanzeri.workers.dev — and read what it is
on the in-app pages at [`/support`](https://splitviewer.mattiapanzeri.workers.dev/support).

## Quickstart (local dev, ~5 minutes)

Prerequisites: Node 18+ (24 recommended) and npm.

```bash
git clone https://github.com/panz3r/splitviewer && cd splitviewer
npm install
npm run setup-local   # writes .dev.vars with fresh keys, applies the local D1 schema
npm run dev           # → http://localhost:8787
```

`npm run setup-local` is idempotent: re-running keeps existing key values unless you
replace them. To test the full OAuth flow locally you need a *dev* Splitwise app
(Splitwise allows one callback URL per app):

1. Register an app at https://secure.splitwise.com/apps with exactly
   `http://localhost:8787/auth/callback` as the callback URL.
2. Put its client id + secret into `.dev.vars` (the setup script prompts for both).

Without credentials the app runs fine — `/auth/login` just returns 503 until they are set.

## Self-hosting (production)

Self-hosting means **your own Cloudflare account** (Workers runtime; no Docker). Every
Cloudflare resource must be created with **EU jurisdiction** (`--jurisdiction eu`) — a
hard compliance requirement of this project.

```bash
npm install
npx wrangler login
npx wrangler d1 create splitviewer --jurisdiction eu    # paste database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put TOKEN_ENCRYPTION_KEY            # openssl rand -hex 32
npx wrangler secret put SESSION_SECRET                  # openssl rand -hex 32
npx wrangler secret put SPLITWISE_CLIENT_SECRET

# register a PROD Splitwise app at https://secure.splitwise.com/apps with the
# single callback URL: https://<your-worker-domain>/auth/callback, then put its
# client id into wrangler.jsonc's SPLITWISE_CLIENT_ID var

npx wrangler deploy
```

`wrangler.example.jsonc` shows the full config with placeholders. Secrets never live in
code or config files — details and troubleshooting in [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy model

- Public pages show **first name + last initial only** (e.g. `Marco P.`) — never emails,
  avatars, full surnames, member ids, or itemized expenses.
- Debts are grouped **by currency** — amounts are shown verbatim and never converted.
- OAuth tokens are **AES-256-GCM encrypted at rest** (key lives in a wrangler secret).
- The cached snapshot contains only sanitized labels, so even the cache is safe.
- **Revocation is instant**: deactivating a share kills the public page, its cache row,
  and the OG image immediately.
- Data storage is EU-jurisdiction Cloudflare D1 only.

## Architecture

Strict MVC layering — `docs/architecture.md` is the one-page map:

```
controllers/ → domain/ (services) → repositories/ (D1) → presentation ui/
```

- **Controllers** (`src/controllers/`): thin Hono routers; HTTP wiring only.
- **Domain** (`src/domain/`): business logic, framework-agnostic, fully unit-tested.
- **Repositories** (`src/repositories/`): the only D1 SQL; interface + D1 + in-memory impls.
- **Views** (`src/ui/`): JSX-only page components.
- **i18n** (`src/i18n/`): all copy lives in `en.json` / `it.json`; the `Dict` type is
  derived from `en.json`, so key parity is compile-enforced.

## Stack

- **Cloudflare Workers** + **Hono** (server-side JSX, no client JS on public pages)
- **Cloudflare D1** (SQLite) — EU-jurisdiction database
- Splitwise API v3.0 via OAuth 2.0 (`secure.splitwise.com`)
- OG images: satori + resvg via [`@cf-wasm/og`](https://github.com/fineshopdesign/cf-wasm)
- Vitest workers integration for tests (`npm test`)

## License

GNU GPL v3 — see [LICENSE](LICENSE).

## Support

Questions, FAQ and abuse reports: see [SUPPORT.md](SUPPORT.md) or the in-app
support page at `/support`. Contributions welcome — read
[CONTRIBUTING.md](CONTRIBUTING.md) first.
