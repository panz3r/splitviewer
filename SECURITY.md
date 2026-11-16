# Security policy

## Reporting a vulnerability, takedown, or privacy concern

**Please do not open public issues for these.** Issues are public, and a share
link (`…/p/<slug>`) is the only thing protecting a dashboard.

Report privately through GitHub's private vulnerability reporting:
<https://github.com/panz3r/splitviewer/security/advisories/new>

Use it for:

- security vulnerabilities (auth, session, crypto, injection, CI/CD, …);
- data-leak paths (anything exposing emails, avatars, full surnames, member
  ids, or itemized data on public pages, OG images, or caches);
- takedown requests for a share link that should not be public;
- privacy concerns about the hosted instance.

Include what you saw, where (hosted instance or self-hosted URL), and — for
takedowns — the share link. Leak reports and takedowns are treated as urgent.
Share owners can always revoke a link instantly from their dashboard.

## Supported versions

Only the latest release (and the hosted instance, which tracks it) receives
security fixes. Self-hosters should stay on the latest release.

## Scope notes

- Known and accepted: GHSA-wx4j-mvgx-mqwp (satori, via `@cf-wasm/og`). OG
  images are rasterized server-side from masked labels only; see the note in
  `src/controllers/og.tsx`.
- Self-hosted instances are operated by their owners; report issues in those
  deployments to the respective operator.
