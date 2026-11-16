// Shares repository: the ONLY module that touches
// the `shares` table. Interface + D1 implementation + in-memory implementation.
export interface UserShareRow {
  splitwise_group_id: string;
  slug: string;
  is_active: number;
}

export interface CreateShareInput {
  userId: string;
  splitwiseGroupId: string;
  groupName: string;
  slug: string;
}

export interface SharesRepo {
  /** Owner + group behind an ACTIVE public slug (snapshot revalidation). */
  activeBySlug(slug: string): Promise<{ userId: string; groupId: string } | null>;
  /** Fast existence check for public-route gating (unknown vs revoked 404s). */
  isActive(slug: string): Promise<boolean>;
  /** All shares owned by a user (dashboard sectioning). */
  byUser(userId: string): Promise<UserShareRow[]>;
  /**
   * Upsert keyed on (user_id, splitwise_group_id): re-sharing replaces the
   * slug, quietly killing any old public link WITHOUT needing cascade deletes
   * elsewhere. Throws on a slug-PK collision (astronomically rare); the
   * service layer owns slug rotation retries.
   */
  createOrRotate(input: CreateShareInput): Promise<void>;
  /** Deactivate the caller's own share. Returns whether a row changed. */
  deactivate(userId: string, slug: string): Promise<boolean>;
}

// ---- D1 implementation -------------------------------------------------------

export class D1SharesRepo implements SharesRepo {
  constructor(private readonly env: CloudflareBindings) {}

  async activeBySlug(slug: string): Promise<{ userId: string; groupId: string } | null> {
    const row = await this.env.DB.prepare(
      "SELECT user_id, splitwise_group_id FROM shares WHERE slug = ?1 AND is_active = 1",
    )
      .bind(slug)
      .first<{ user_id: string; splitwise_group_id: string }>();
    return row ? { userId: row.user_id, groupId: row.splitwise_group_id } : null;
  }

  async isActive(slug: string): Promise<boolean> {
    const row = await this.env.DB.prepare(
      "SELECT 1 FROM shares WHERE slug = ?1 AND is_active = 1",
    )
      .bind(slug)
      .first();
    return row != null;
  }

  async byUser(userId: string): Promise<UserShareRow[]> {
    const rows = await this.env.DB.prepare(
      "SELECT splitwise_group_id, slug, is_active FROM shares WHERE user_id = ?1",
    )
      .bind(userId)
      .all<UserShareRow>();
    return rows.results ?? [];
  }

  async createOrRotate(input: CreateShareInput): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO shares (slug, user_id, splitwise_group_id, group_name)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id, splitwise_group_id) DO UPDATE SET
         slug = ?1, group_name = ?4, is_active = 1`,
    )
      .bind(input.slug, input.userId, input.splitwiseGroupId, input.groupName)
      .run();
  }

  async deactivate(userId: string, slug: string): Promise<boolean> {
    const res = await this.env.DB.prepare(
      "UPDATE shares SET is_active = 0 WHERE slug = ?1 AND user_id = ?2",
    )
      .bind(slug, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
}

// ---- In-memory implementation (unit tests) -----------------------------------

export interface InMemoryShare {
  slug: string;
  userId: string;
  splitwiseGroupId: string;
  groupName: string;
  isActive: boolean;
}

export class InMemorySharesRepo implements SharesRepo {
  readonly rows: InMemoryShare[] = [];

  async activeBySlug(slug: string): Promise<{ userId: string; groupId: string } | null> {
    const row = this.rows.find((r) => r.slug === slug && r.isActive);
    return row ? { userId: row.userId, groupId: row.splitwiseGroupId } : null;
  }

  async isActive(slug: string): Promise<boolean> {
    return this.rows.some((r) => r.slug === slug && r.isActive);
  }

  async byUser(userId: string): Promise<UserShareRow[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => ({
        splitwise_group_id: r.splitwiseGroupId,
        slug: r.slug,
        is_active: r.isActive ? 1 : 0,
      }));
  }

  async createOrRotate(input: CreateShareInput): Promise<void> {
    const collision = this.rows.find((r) => r.slug === input.slug);
    if (collision) throw new Error("UNIQUE constraint failed: shares.slug");
    const existing = this.rows.find(
      (r) => r.userId === input.userId && r.splitwiseGroupId === input.splitwiseGroupId,
    );
    if (existing) {
      existing.slug = input.slug;
      existing.groupName = input.groupName;
      existing.isActive = true;
      return;
    }
    this.rows.push({
      slug: input.slug,
      userId: input.userId,
      splitwiseGroupId: input.splitwiseGroupId,
      groupName: input.groupName,
      isActive: true,
    });
  }

  async deactivate(userId: string, slug: string): Promise<boolean> {
    const row = this.rows.find((r) => r.slug === slug && r.userId === userId);
    if (!row || !row.isActive) return false;
    row.isActive = false;
    return true;
  }
}
