// Legacy facade — kept during the MVC transition. The implementation moved to
// domain/sessionService.ts; cookie-context reading lives in src/middleware.ts.
export {
  STATE_COOKIE,
  SESSION_COOKIE,
  STATE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  signState,
  verifyState,
  signSession,
  verifySession,
} from "../domain/sessionService";
