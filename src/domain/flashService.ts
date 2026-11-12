// Flash message resolution (domain layer): maps dashboard query params
// (?msg=created, ?err=not_found, ...) to dictionary text. Controllers only
// carry opaque keys in redirect URLs; translation happens here so no route
// hardcodes translated strings.
import { getDict, type Lang } from "../i18n";

/** Query-param values the share API puts into ?msg= / ?err=. */
export type FlashMsgParam = "created" | "revoked";
export type FlashErrParam = "invalid_request" | "not_found" | "share_write_failed";

const MSG_PARAM_TO_DICT_KEY: Record<FlashMsgParam, "flashCreated" | "flashRevoked"> = {
  created: "flashCreated",
  revoked: "flashRevoked",
};

const ERR_PARAM_TO_DICT_KEY: Record<FlashErrParam, "flashInvalid" | "flashNotFound" | "flashWriteFailed"> = {
  invalid_request: "flashInvalid",
  not_found: "flashNotFound",
  share_write_failed: "flashWriteFailed",
};

export interface ResolvedFlash {
  msg?: string;
  err?: string;
}

/**
 * Resolves query params into localized flash text. Unknown keys resolve to
 * undefined (no flash rendered) — never leak raw param values into the page.
 */
export function resolveFlash(
  lang: Lang,
  msgParam?: string,
  errParam?: string,
): ResolvedFlash | undefined {
  const t = getDict(lang);
  const out: ResolvedFlash = {};
  if (msgParam && msgParam in MSG_PARAM_TO_DICT_KEY) {
    out.msg = t.dash[MSG_PARAM_TO_DICT_KEY[msgParam as FlashMsgParam]];
  }
  if (errParam && errParam in ERR_PARAM_TO_DICT_KEY) {
    out.err = t.dash[ERR_PARAM_TO_DICT_KEY[errParam as FlashErrParam]];
  }
  return out.msg || out.err ? out : undefined;
}
