#!/usr/bin/env bash
# SplitViewer local-dev setup. Idempotent: re-running refreshes .dev.vars
# values you leave blank. Never commits secrets (writes .dev.vars, gitignored).
#
# Usage: bash scripts/setup-local.sh [--yes]
#   --yes  accept defaults without prompting (placeholder Splitwise creds)
set -euo pipefail

cd "$(dirname "$0")/.."

ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

prompt() {
  # prompt <var-name> <default> — echoes the chosen value
  local name="$1" default="$2" value
  if [ "$ASSUME_YES" = "1" ] || [ ! -t 0 ]; then
    echo "$default"
    return
  fi
  read -r -p "$name [$default]: " value || true
  echo "${value:-$default}"
}

echo "==> SplitViewer local setup"

# 1. Secrets ------------------------------------------------------------------
TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"

DEV_CLIENT_ID_DEFAULT="REPLACE_ME_SPLITWISE_CLIENT_ID"
DEV_CLIENT_SECRET_DEFAULT="REPLACE_ME_SPLITWISE_CLIENT_SECRET"

if [ -f .dev.vars ]; then
  echo "    existing .dev.vars found — keep any value by pressing Enter"
  existing_key="$(sed -n 's/^TOKEN_ENCRYPTION_KEY="\(.*\)"/\1/p' .dev.vars)"
  existing_session="$(sed -n 's/^SESSION_SECRET="\(.*\)"/\1/p' .dev.vars)"
  [ -n "$existing_key" ] && TOKEN_ENCRYPTION_KEY="$existing_key"
  [ -n "$existing_session" ] && SESSION_SECRET="$existing_session"
fi

SPLITWISE_CLIENT_ID="$(prompt "SPLITWISE_CLIENT_ID (dev Splitwise app)" "$DEV_CLIENT_ID_DEFAULT")"
SPLITWISE_CLIENT_SECRET="$(prompt "SPLITWISE_CLIENT_SECRET (dev Splitwise app)" "$DEV_CLIENT_SECRET_DEFAULT")"

cat > .dev.vars <<EOF
TOKEN_ENCRYPTION_KEY="$TOKEN_ENCRYPTION_KEY"
SESSION_SECRET="$SESSION_SECRET"
SPLITWISE_CLIENT_ID="$SPLITWISE_CLIENT_ID"
SPLITWISE_CLIENT_SECRET="$SPLITWISE_CLIENT_SECRET"
EOF
echo "==> wrote .dev.vars (gitignored)"

# 2. Wrangler config (deployment-specific, gitignored) ------------------------
if [ ! -f wrangler.jsonc ]; then
  cp wrangler.example.jsonc wrangler.jsonc
  echo "==> seeded wrangler.jsonc from wrangler.example.jsonc"
  cat <<'EOF'
    NOTE: fill in wrangler.jsonc before deploying:
      - database_id:  stamp the id printed by
            npx wrangler d1 create splitviewer --jurisdiction eu
      - SPLITWISE_CLIENT_ID: your PROD Splitwise app's client id
    (Tests and local dev work without these; only `wrangler deploy` needs them.)
EOF
fi

# 3. Local D1 + schema --------------------------------------------------------
npx wrangler d1 migrations apply DB --local
echo "==> local D1 schema applied"

# 4. Next steps ---------------------------------------------------------------
cat <<'EOF'

Local setup complete. Next steps:

  1. Splitwise allows ONE callback URL per OAuth app, so register a *dev* app
     at https://secure.splitwise.com/apps with exactly:
         http://localhost:8787/auth/callback
     and put its client id + secret into .dev.vars (rerun this script or edit
     the file directly). Placeholder credentials are fine for running without
     OAuth — /auth/login will return 503 until they are set.

  2. Start the dev server:      npm run dev    (http://localhost:8787)
  3. Run the tests:             npm test
  4. Typecheck both configs:    npx tsc -p tsconfig.json && npx tsc -p test/tsconfig.json

Production deployment (README.md has the full walkthrough):

  npx wrangler login
  # fill wrangler.jsonc: create the D1 and stamp its id, plus your PROD client id
  npx wrangler d1 create splitviewer --jurisdiction eu   # EU-only, required
  npx wrangler d1 migrations apply DB --remote
  npx wrangler secret put TOKEN_ENCRYPTION_KEY           # openssl rand -hex 32
  npx wrangler secret put SESSION_SECRET
  npx wrangler secret put SPLITWISE_CLIENT_SECRET
  # register a PROD Splitwise app with callback https://<your-worker>/auth/callback
  npx wrangler deploy
EOF
