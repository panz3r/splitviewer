// Domain DTOs. Framework-agnostic shapes passed
// between services and presentation; no Context, no D1 rows, no fetch types.
import type { SanitizedSnapshot } from "./sanitizeService";
import type { Lang } from "../i18n";

export type { Lang };

/** Result of resolving a public dashboard view for a slug (the SWR decision tree). */
export interface PublicView {
  status: 200 | 404 | 502;
  xCache: "fresh" | "stale" | "refetched";
  snapshot: SanitizedSnapshot | null;
  asOfSeconds: number | null;
}

/** Flash message keys carried in dashboard query params (?msg= / ?err=). */
export type FlashMsgKey = "created" | "revoked";
export type FlashErrKey = "invalid_request" | "not_found" | "share_write_failed";
export type FlashKey = FlashMsgKey | FlashErrKey;

/** A share attached to a group, as the dashboard needs it. */
export interface DashboardShare {
  slug: string;
  isActive: boolean;
}

/** One group card on the organizer dashboard. */
export interface DashboardGroup {
  id: string;
  name: string;
  avatarUrl?: string;
  share: DashboardShare | null;
  /** Grouping key from Splitwise (amounts only); currency blocks come later. */
  simplifiedDebts: Array<{ amount: string }>;
  lastUpdate: string | null;
}

export type DashboardSectionKey = "public" | "private" | "archived";

export interface DashboardSection {
  key: DashboardSectionKey;
  groups: DashboardGroup[];
}

/** Fully-resolved dashboard view model handed to the page component. */
export interface DashboardData {
  sections: DashboardSection[];
  flashMsg?: string;
  flashErr?: string;
}
