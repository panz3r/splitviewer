# SplitViewer

> Shareable public dashboards for [Splitwise](https://splitwise.com) groups.

SplitViewer lets a group **organizer** publish a read-only, anonymized snapshot of their
Splitwise group debts behind a short public link (`/p/<slug>`) that unfurls nicely in
messengers (Telegram, WhatsApp, iMessage, Slack, X) with a generated OG card.

## Privacy model

- Public pages show **first name + last initial only** (e.g. `Marco P.`) — never emails,
  avatars, full surnames, member ids, or itemized expenses.
- Debts are grouped **by currency** — amounts are shown verbatim and never converted.
- OAuth tokens are **AES-256-GCM encrypted at rest** (key lives in a wrangler secret).
- The cached snapshot contains only sanitized labels, so even the cache is safe.
- **Revocation is instant**: deactivating a share kills the public page, its cache row,
  and the OG image immediately.

## Stack

- **Cloudflare Workers** + **Hono** (server-side JSX, no client JS on public pages)
- **Cloudflare D1** (SQLite) — EU-jurisdiction database
- Splitwise API v3.0 via OAuth 2.0 (`secure.splitwise.com`)
- OG images: satori + resvg via [`@cf-wasm/og`](https://github.com/fineshopdesign/cf-wasm)
- Vitest workers integration for tests (`npm test`)

## Self-hosting

```bash
npm install
npx wrangler login                       # Cloudflare account
npx wrangler d1 create splitviewer --jurisdiction eu
# paste database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put TOKEN_ENCRYPTION_KEY   # openssl rand -hex 32
npx wrangler secret put SPLITWISE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET         # openssl rand -hex 32
# register a Splitwise app at https://secure.splitwise.com/apps with a single
# callback URL: https://<your-worker-domain>/auth/callback
npx wrangler deploy
```

Local development: `npm run dev` (needs a `.dev.vars` with the same secret names and a
paid-attention-to detail: Splitwise allows **one callback URL per app**, so use a second
app with `http://localhost:8787/auth/callback` for local testing).

## License

GNU GPL v3 — see [LICENSE](LICENSE).

## Support

Questions, FAQ and abuse reports: see [SUPPORT.md](SUPPORT.md) or the in-app
support page at `/support`. Contributions welcome — read
[CONTRIBUTING.md](CONTRIBUTING.md) first.
