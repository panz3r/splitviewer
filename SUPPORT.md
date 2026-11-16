# Support — SplitViewer

Community support for [SplitViewer](https://github.com/panz3r/splitviewer), a
tool for publishing read-only, privacy-first dashboards of Splitwise group
debts at an organizer's request.

> Not affiliated with Splitwise. We use their public API. "Splitwise" is a
> trademark of its respective owner.

## How it works

An organizer connects their Splitwise account, picks a group, and gets a public
link. Anyone with that link sees a read-only dashboard of open debts — **first
names and last initials only** — grouped by currency, refreshed automatically
(stale-while-revalidate, ~7-minute window). Revocation is instant from the
organizer's dashboard.

## Frequently asked questions

**Is my group public?**
Only if an organizer creates a share link for it, under their control.

**Do viewers need a Splitwise account?**
No — the link is public for browsers, humans, and messenger previews alike.

**What exactly is shown?**
Group name, open settlements ("First Name L. → First Name L." with amount), and
the currency of each block.

**What is never shown?**
Emails, avatars, full surnames, member ids, expense descriptions or receipts,
invite links. The stored snapshot contains **only** sanitized labels — nothing
sensitive is persisted anywhere.

**How is Splitwise access stored?**
OAuth tokens are encrypted at rest with AES-256-GCM; the key never leaves
Cloudflare secrets. Data lives in Cloudflare D1 restricted to **European
Union** jurisdiction.

**How do I revoke a dashboard?**
Organizers press "Revoke" on the dashboard; the page, cached snapshot, and OG
image stop responding immediately. Re-sharing always generates a fresh link.

**My connection expired**
Re-authorize from the dashboard when prompted; public pages keep serving the
last sanitized snapshot until then.

## Report a problem or request a takedown

- **Takedown requests and privacy concerns** (a link that shouldn't be public,
  a name that isn't masked properly): report them **privately** via
  <https://github.com/panz3r/splitviewer/security/advisories/new> — never post a
  share link (`…/p/<slug>`) in a public issue. We treat leak reports as urgent;
  share owners can always revoke instantly themselves from the dashboard.
  See [SECURITY.md](SECURITY.md).
- **Bugs and questions**: guided report form at
  <https://github.com/panz3r/splitviewer/issues/new?template=report.yml>.
- General issue list: <https://github.com/panz3r/splitviewer/issues>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — development setup, test conventions,
and the privacy ground rules.
