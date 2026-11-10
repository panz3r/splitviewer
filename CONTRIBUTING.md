# Contributing to SplitViewer

Thanks for your interest in contributing! SplitViewer is a community tool for
publishing read-only, privacy-first dashboards of Splitwise group debts.

> **Not affiliated with Splitwise** — we only use their public API. "Splitwise" is
> a trademark of its respective owner.

## Development setup

Prerequisites: Node 18+ (24 recommended) and a Cloudflare account (the `wrangler`
CLI is a local dependency).

```bash
npm install

# Local D1 + schema
npx wrangler d1 migrations apply DB --local

# Local dev secrets (never commit!)
openssl rand -hex 32 > .tmp-key
printf 'TOKEN_ENCRYPTION_KEY="%s"\n' "$(cat .tmp-key | tr -d '\n')" > .dev.vars
printf 'SPLITWISE_CLIENT_ID="YOUR_DEV_CLIENT_ID"\n' >> .dev.vars
printf 'SPLITWISE_CLIENT_SECRET="YOUR_DEV_CLIENT_SECRET"\n' >> .dev.vars
printf 'SESSION_SECRET="%s"\n' "$(cat .tmp-key | tr -d '\n')" >> .dev.vars
rm .tmp-key
# then register a dev Splitwise app (https://secure.splitwise.com/apps) whose
# single registered callback is http://localhost:8787/auth/callback

npm run dev          # http://localhost:8787
npm test             # vitest with the Cloudflare Workers pool
npx tsc -p tsconfig.json && npx tsc -p test/tsconfig.json
npx wrangler deploy  # ship it
```

Cloudflare production setup (D1 in **EU jurisdiction**, secrets) is documented in
the [README](README.md).

## Ground rules

- **Privacy is the core feature.** Public content may only ever originate from
  sanitized snapshots (`src/lib/sanitize.ts`): first name + last initial, no
  emails/ids/avatars/invite links. If you add a feature, add a test that scans
  the output for sensitive strings.
- **All Cloudflare resources must be created with `jurisdiction: eu`** — this is a
  project compliance requirement (see `AGENTS.md`).
- **Secrets never live in code or wrangler.jsonc.** Dev secrets go to `.dev.vars`
  (gitignored), production uses `wrangler secret put`.
- **Tests-first for route logic.** Use the existing vitest workers integration +
  injected-fetch patterns (see `test/` for examples). Weird-but-deterministic
  Splitwise behavior is documented in code comments, not guessed.
- Working docs (per-phase plans, gotchas) live in `plans/` and are gitignored —
  put durable *consumer* docs in `README.md` / `SUPPORT.md` / `CONTRIBUTING.md`.

## Workflow

1. Fork / branch (`feat/...` or `fix/...`).
2. Make the change; add or update tests; keep typecheck + tests green.
3. Open a PR against `main` with a short description and screenshots for UI
   changes.

## Reporting bugs / security

Open an issue at https://github.com/panz3r/splitviewer/issues. For anything you'd
consider sensitive (e.g. a data-leak path), please say so in the issue title —
the app holds no plaintext secrets, but we still treat leak reports as urgent.
