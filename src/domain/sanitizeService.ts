// Sanitization engine — the core privacy feature of SplitViewer.
//
// RULE (AGENTS.md): the public view shows First Name + Last Initial only.
// Everything else from the Splitwise group object (emails, pictures, full
// surnames, invite links, member ids) MUST NOT survive this function — the
// output snapshot is what gets persisted into group_cache, so secrecy here
// means the cache itself is safe to store and serve.

export interface SanitizedDebt {
  from: string;
  to: string;
  amount: string;
}

export interface SanitizedCurrencyBlock {
  currencyCode: string;
  debts: SanitizedDebt[];
}

export interface SanitizedSnapshot {
  slug: string;
  groupId: string;
  name: string;
  /** Group cover/avatar URL (Splitwise CDN) — group-level asset, same trust
   *  class as `name`. Internal to the cache: the public HTML page never renders
   *  it, only the OG image consumes it (as embedded pixels). */
  coverUrl?: string | null;
  updatedAt: string | null;
  currencies: SanitizedCurrencyBlock[];
}

export interface RawMemberInput {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RawGroupInput {
  id: string;
  name: string;
  coverUrl?: string;
  updatedAt?: string;
  members: RawMemberInput[];
  simplifiedDebts: Array<{ from: string; to: string; amount: string; currencyCode: string }>;
}

const UNKNOWN_MEMBER = "Someone";
const MAX_FIRST_NAME_LENGTH = 40;

/**
 * "Marco" + "Panzeri" → "Marco P."; unknown id → "Someone".
 * Splitwise's first_name is free text, so it is never trusted verbatim: only
 * its first word survives (a full name typed into first_name still collapses
 * to "First L."), and email-like or letterless values fall back to "Someone".
 */
export function memberLabel(members: RawMemberInput[], id: string): string {
  const member = members.find((m) => m.id === id);
  if (!member) return UNKNOWN_MEMBER;
  const words = member.firstName.trim().split(/\s+/).filter(Boolean);
  const first = (words[0] ?? "").slice(0, MAX_FIRST_NAME_LENGTH);
  if (!first || first.includes("@") || !/\p{L}/u.test(first)) return UNKNOWN_MEMBER;
  const surname = member.lastName.trim() || (words.length > 1 ? words[words.length - 1] : "");
  const lastInitial = Array.from(surname)[0] ?? "";
  return /\p{L}/u.test(lastInitial) ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

export function sanitizeGroup(slug: string, raw: RawGroupInput): SanitizedSnapshot {
  const byCurrency = new Map<string, SanitizedDebt[]>();
  for (const debt of raw.simplifiedDebts) {
    const block = byCurrency.get(debt.currencyCode) ?? [];
    block.push({
      from: memberLabel(raw.members, debt.from),
      to: memberLabel(raw.members, debt.to),
      amount: debt.amount,
    });
    byCurrency.set(debt.currencyCode, block);
  }
  return {
    slug,
    groupId: raw.id,
    name: raw.name,
    coverUrl: raw.coverUrl ?? null,
    updatedAt: raw.updatedAt ?? null,
    currencies: [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyCode, debts]) => ({ currencyCode, debts })),
  };
}
