// Legacy facade — kept during the MVC transition. The sanitization engine (the
// core privacy feature) moved to domain/sanitizeService.ts; import from there
// in new code.
export {
  memberLabel,
  sanitizeGroup,
  type SanitizedDebt,
  type SanitizedCurrencyBlock,
  type SanitizedSnapshot,
  type RawMemberInput,
  type RawGroupInput,
} from "../domain/sanitizeService";
