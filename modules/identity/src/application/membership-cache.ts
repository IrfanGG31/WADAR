import type { MembershipWithRole } from "../infra/memberships.repository.js";

const TTL_MS = 15_000;
const MAX_ENTRIES = 5_000;

/**
 * Per-process cache of "user U is a member of tenant T with role R", used by
 * `TenantGuard`. Every tenant-scoped request otherwise spends a whole
 * transaction (4 DB round trips) re-checking the membership, and one screen
 * fires several requests within a second.
 *
 * Deliberately short-lived and positive-only: a role change or removal takes
 * effect everywhere within TTL_MS (immediately in the process that made the
 * change — see `invalidateTenant`), and a newly accepted invitation is never
 * blocked by a cached "not a member".
 */
export class MembershipCache {
  private readonly entries = new Map<string, { membership: MembershipWithRole; expiresAt: number }>();

  constructor(
    private readonly ttlMs = TTL_MS,
    private readonly maxEntries = MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(tenantId: string, userId: string): MembershipWithRole | undefined {
    const key = `${tenantId}:${userId}`;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.membership;
  }

  set(membership: MembershipWithRole): void {
    const key = `${membership.tenantId}:${membership.userId}`;
    this.entries.delete(key); // re-insert at the end: Map keeps insertion order, oldest first
    this.entries.set(key, { membership, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  invalidateTenant(tenantId: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${tenantId}:`)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const membershipCache = new MembershipCache();
