# Architecture (one page)

SplitViewer is a Cloudflare Worker (Hono SSR + D1) organized as strict MVC. The
dependency direction is one-way:

```
src/index.tsx (worker entry)
      │
src/app.ts (composition: middleware + controllers, registration order matters)
      │
src/controllers/*      thin Hono routers — HTTP wiring only (no JSX, no SQL, no lang logic)
      │                │
      │                ├── src/wiring.ts    composition root: env → repositories → services
      │                ▼
      │        src/domain/*          business logic (framework-agnostic: no Context,
      │                │             no env.DB, no fetch — deps injected; unit-testable)
      │                ▼
      │        src/repositories/*    the ONLY D1 SQL. Interface + D1 impl + InMemory impl
      │                              per repo (users, shares, cache)
      ▼
src/ui/*Page.tsx       presentation: props in → JSX out. No services, no env.
src/i18n/*             copy in en.json/it.json; Dict derived from en.json (parity
                       compile-enforced); flash text resolved in domain/flashService.
```

Key DTOs (in `src/domain/types.ts`):

- **`PublicView`** — the resolved public-dashboard state (`status 200|404|502`, `xCache fresh|stale|refetched`, sanitized `snapshot`). Produced by `domain/publicViewService` (the stale-while-revalidate decision tree), consumed by the public + OG controllers.
- **`DashboardData`** — sectioned group cards (`public|private|archived`, 40-day archive rule) + resolved flash text. Produced by `domain/dashboardService`.
- **`FlashKey`s** — opaque query-param values (`?msg=created`, `?err=not_found`) carried in redirects; `domain/flashService` maps them to localized dict text so no route hardcodes copy.

Invariants worth knowing before changing anything (each is pinned by tests
under `test/`): privacy wall (sanitized snapshots only, everywhere),
multi-currency grouping (never blended), instant revocation (cache dropped on
revoke), tokens encrypted at rest, cookies `Secure` only on https, Hono
middleware registered before the routes that depend on them. Gotcha log:
`AGENTS.md`; contributor walkthrough: `CONTRIBUTING.md`.
