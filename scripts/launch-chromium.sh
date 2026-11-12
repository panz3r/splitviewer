#!/usr/bin/env bash
# Launches the locally installed Chromium with the remote-debugging port the
# Chrome DevTools MCP attaches to (127.0.0.1:9222).
#
# The profile is kept in ./.chromium-profile (gitignored) so logins persist:
# sign into Splitwise once inside this browser and the MCP can use that
# session for authenticated checks (Splitwise blocks automated logins).
# Run `npm run chromium:install` first if the browser is missing.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d chromium ] || [ -z "$(find chromium -name 'chrome' -o -name 'chrome.app' 2>/dev/null | head -1)" ]; then
  echo "chromium not found — installing first..."
  npm run --silent chromium:install
fi

exec npx @puppeteer/browsers launch chromium@latest \
  --path chromium \
  -- --remote-debugging-port=9222 --user-data-dir="$PWD/.chromium-profile" "$@"
