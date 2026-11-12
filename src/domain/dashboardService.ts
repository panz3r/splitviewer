// Dashboard service (domain layer): resolves the organizer's group list into
// sectioned, share-annotated view-model data. Framework-agnostic — Splitwise
// access, token decryption, and share lookup all arrive via injected deps.
//
// Sectioning (M4, behavior contract): "Archived" follows Splitwise's own rule
// — settled up for more than 40 days. Sections sort by last update, newest first.
import type { Lang } from "../i18n";
import { resolveFlash } from "./flashService";
import type {
  DashboardData,
  DashboardGroup,
  DashboardSectionKey,
} from "./types";
import type { SplitwiseClient, SplitwiseGroup } from "../lib/splitwise";
import type { SharesRepo, UserShareRow } from "../repositories/sharesRepo";

export interface DashboardDeps {
  /** Decrypts a stored (ciphertext) access token. */
  decryptToken(encryptedAccessToken: string): Promise<string>;
  splitwise: Pick<SplitwiseClient, "fetchGroups">;
  shares: Pick<SharesRepo, "byUser">;
}

/** Either resolved dashboard data, or the "token rejected" reconnect outcome. */
export type DashboardResult =
  | { kind: "ok"; data: DashboardData }
  | { kind: "reconnect" };

const ARCHIVE_AFTER_MS = 40 * 24 * 60 * 60 * 1000;

function isSettled(group: { simplifiedDebts: Array<{ amount: string }> }): boolean {
  return group.simplifiedDebts.every((d) => Number(d.amount) === 0);
}

function sortByLastUpdateDesc(groups: SplitwiseGroup[]): SplitwiseGroup[] {
  return [...groups].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
}

export function sectionize(
  groups: SplitwiseGroup[],
  sharesByGroupId: Map<string, UserShareRow>,
): Array<{ key: DashboardSectionKey; groups: SplitwiseGroup[] }> {
  const archived = groups.filter(
    (g) =>
      isSettled(g) &&
      typeof g.updatedAt === "string" &&
      Date.now() - new Date(g.updatedAt).getTime() > ARCHIVE_AFTER_MS,
  );
  const rest = groups.filter((g) => !archived.includes(g));
  const publicGroups = rest.filter((g) => sharesByGroupId.get(g.id)?.is_active === 1);
  const privateGroups = rest.filter((g) => sharesByGroupId.get(g.id)?.is_active !== 1);
  return [
    { key: "public", groups: sortByLastUpdateDesc(publicGroups) },
    { key: "private", groups: sortByLastUpdateDesc(privateGroups) },
    { key: "archived", groups: sortByLastUpdateDesc(archived) },
  ];
}

/**
 * Builds the dashboard view model. Returns a `reconnect` outcome when
 * Splitwise rejects the stored token (401) — the controller renders the
 * friendly reconnect page instead of a 5xx. Other Splitwise failures throw.
 */
export async function buildDashboard(
  user: { id: string; encrypted_access_token: string },
  lang: Lang,
  flashParams: { msg?: string; err?: string },
  deps: DashboardDeps,
): Promise<DashboardResult> {
  let groups: SplitwiseGroup[];
  try {
    const token = await deps.decryptToken(user.encrypted_access_token);
    groups = await deps.splitwise.fetchGroups(token);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "SplitwiseAuthError" &&
      (error as { status?: number }).status === 401
    ) {
      return { kind: "reconnect" };
    }
    throw error;
  }

  const shareRows = await deps.shares.byUser(user.id);
  const sharesByGroupId = new Map(shareRows.map((s) => [s.splitwise_group_id, s]));

  // Splitwise returns id 0 ("Non-group expenses") in get_groups — not
  // shareable; filter it out of the dashboard.
  const visibleGroups = groups.filter((g) => g.id !== "0");

  const sections = sectionize(visibleGroups, sharesByGroupId).map((section) => ({
    ...section,
    groups: section.groups.map(
      (g): DashboardGroup => ({
        id: g.id,
        name: g.name || `Group ${g.id}`,
        avatarUrl: g.avatarUrl,
        share: (() => {
          const row = sharesByGroupId.get(g.id);
          return row ? { slug: row.slug, isActive: row.is_active === 1 } : null;
        })(),
        simplifiedDebts: g.simplifiedDebts,
        lastUpdate: typeof g.updatedAt === "string" ? g.updatedAt : null,
      }),
    ),
  }));

  const flash = resolveFlash(lang, flashParams.msg, flashParams.err);
  const data: DashboardData = {
    sections,
    flashMsg: flash?.msg,
    flashErr: flash?.err,
  };
  return { kind: "ok", data };
}
