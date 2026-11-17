## Summary

<!-- What changed and why. Link issues with "Fixes #123". -->

## Checklist

- [ ] Tests added/updated in the right layer (`test/unit`, `test/integration`, `test/infra`)
- [ ] Typecheck and `npm test` pass locally
- [ ] Public pages still show first name + last initial only — no emails, avatars, full surnames, member ids, or itemized data
- [ ] Debts stay grouped per currency (never blended or converted)
- [ ] New copy added to both `src/i18n/en.json` and `src/i18n/it.json`
- [ ] D1 migrations (if any) are backward compatible with the currently deployed code
- [ ] No secrets, real share links, or personal data in code, tests, or screenshots
