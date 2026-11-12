#!/usr/bin/env bash
# Installs a pinned-to-major Chromium for local Chrome DevTools MCP usage
# (opencode.json wires the MCP to --browserUrl=http://127.0.0.1:9222).
# Installs into ./chromium (gitignored) so it never lands in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
npx @puppeteer/browsers install chromium@latest --path chromium
echo "==> chromium installed into ./chromium — launch it with: npm run chromium:launch"
