// English copy — source of truth for UI strings. `src/i18n/it.ts` must keep
// exact key parity (typed as Dict).
export const en = {
  meta: {
    homeTitle: "SplitViewer — shareable Splitwise group dashboards",
    homeDescription:
      "Recap your Splitwise group debts on a public, read-only page. First names only, no viewer accounts, revocable in one click.",
    supportTitle: "Support — SplitViewer",
    supportDescription:
      "FAQ, privacy details, and how to report a problem with a SplitViewer share link.",
    homeOgTitle: "Recap your group debts, then just share one link.",
  },
  nav: {
    support: "Support",
    reportIssue: "Report an issue",
    langToggle: "Italiano",
  },
  footer: {
    notAffiliated: "Not affiliated with Splitwise · Built with their public API",
  },
  home: {
    heroTitle: "Recap your group debts, then just share one link.",
    heroLead1: "SplitViewer lets you publish a read-only dashboard of your Splitwise group:",
    heroLead2: "who owes whom, grouped by currency — with",
    heroLead3: "first names only",
    heroLead4: ", and revocable in one click.",
    ctaLogin: "Continue with Splitwise",
    ctaSample: "See a sample dashboard",
    howTitle: "How it works",
    step1Title: "Connect Splitwise",
    step1Body: "Sign in once with your Splitwise account. We only read group balances.",
    step2Title: "Pick a group",
    step2Body: "Choose which of your groups gets a public dashboard — private details stay private.",
    step3Title: "Share one link",
    step3Body: "Anyone with the link opens a clean dashboard — no app, no account, automatically refreshed.",
    sampleTitle: "A sample dashboard",
    sampleCaption:
      "Sample with fake data — regenerated on each visit, so you'll see different names and amounts each time.",
    privacyTitle: "Privacy first",
    privacyItem1a: "Public pages show",
    privacyItem1b: "first names and last initials only",
    privacyItem1c: "— never emails, avatars, or full surnames.",
    privacyItem2a: "Splitwise tokens are",
    privacyItem2b: "encrypted at rest",
    privacyItem2c: "(AES-256-GCM).",
    privacyItem3a: "The cached snapshot stores",
    privacyItem3b: "only sanitized labels",
    privacyItem3c: "— nothing sensitive is persisted anywhere.",
    privacyItem4a: "One click revokes",
    privacyItem4b: "a dashboard: old links stop working instantly.",
    privacyItem5: "EU-hosted data storage (Cloudflare D1, European Union jurisdiction).",
    privacyMore:
      "Questions? The support page has the FAQ, and GitHub issues take bug reports.",
  },
  support: {
    title: "Support",
    howTitle: "How it works, in one paragraph",
    howBody:
      "A SplitViewer organizer connects their Splitwise account, picks a group, and gets a public link. Anyone with that link sees a read-only dashboard of open debts — first names and last initials only — grouped by currency, refreshed automatically roughly every 7 minutes while people open it. The organizer can revoke the link at any time; revocation is instant.",
    faqTitle: "FAQ",
    q1: "Is my group public?",
    a1Before: "Only if you create a share link for it. Creating or revoking a link is always under your control from ",
    a1Link: "your dashboard",
    a1After: ".",
    q2: "Do viewers need a Splitwise account?",
    a2: "No. The public page works for anyone with the link, including crawlers and messenger previews.",
    q3: "What exactly is shown?",
    a3: "Group name; open settlements as “First Name L. → First Name L.” with the amount; the currency of each block.",
    q4: "What is never shown?",
    a4: "Emails, avatars, full surnames, member ids, expense descriptions or receipts, invite links, or anything else from your Splitwise account. The stored snapshot contains only sanitized labels — nothing sensitive is persisted.",
    q5: "How do I revoke a dashboard?",
    a5: "Open your dashboard and press “Revoke”. The page, its cached snapshot, and the OG image stop responding immediately. Old links don’t get re-activated by re-sharing — you get a fresh link each time.",
    q6: "My Splitwise connection expired — what now?",
    a6: "Open your dashboard; if it says “connection expired”, press reconnect to authorize again. Public pages keep serving the last snapshot in the meantime.",
    q7: "Is SplitViewer affiliated with Splitwise?",
    a7: "No. SplitViewer is an independent, open-source tool that uses Splitwise’s public API. Splitwise is a trademark of its respective owner.",
    q8: "Where is the data stored?",
    a8: "In a Cloudflare D1 database restricted to European Union jurisdiction (including Europe-only storage regions).",
    reportTitle: "Report a problem or request a takedown",
    reportBody:
      "Found a link that shouldn’t be public, a bug, or anything else wrong? Please open an issue on GitHub. Share owners can always revoke instantly themselves from the dashboard.",
    projectTitle: "Project & roadmap",
    projectBody:
      "Want to help? See the contributing guide. Currently on the roadmap: dashboard UX polish, multi-language support (starting with Italian), and long-term link management features.",
    yourDashboard: "your dashboard",
  },
  notFound: {
    title: "Not found",
    body: "This dashboard doesn't exist or has been revoked by its owner.",
    what: "What is SplitViewer?",
  },
};

export type Dict = typeof en;
