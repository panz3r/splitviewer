#!/usr/bin/env bash
# Links the repo's committed hooks (.githooks/*) into this clone's hooks dir.
# Run via: npm run hooks:install
#
# Links into "$(git rev-parse --git-common-dir)/hooks" rather than setting
# core.hooksPath, so a global hooks dispatcher that chains to repo hooks keeps
# working. An existing, different hook is never overwritten.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
hooks_dir="$(cd "$(git rev-parse --git-common-dir)" && pwd)/hooks"
mkdir -p "$hooks_dir"

for src in "$root"/.githooks/*; do
	name="$(basename "$src")"
	dest="$hooks_dir/$name"
	if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
		echo "ok        $name (already linked)"
	elif [ -e "$dest" ] || [ -L "$dest" ]; then
		echo "skipped   $name: $dest already exists — merge it by hand or remove it and re-run" >&2
	else
		ln -s "$src" "$dest"
		echo "installed $name -> $dest"
	fi
done

hooks_path="$(git config core.hooksPath || true)"
if [ -n "$hooks_path" ]; then
	echo "note: core.hooksPath is set ($hooks_path); git only runs the hooks above if" >&2
	echo "      that directory chains to the repo's .git/hooks (or unset core.hooksPath)." >&2
fi

if ! command -v betterleaks >/dev/null 2>&1; then
	echo "note: betterleaks is not installed — the pre-commit secret scan will be skipped." >&2
	echo "      Install: brew install betterleaks" >&2
fi
