import { withTenantContext, type Db } from "@wadar/platform";
import { getMembershipByUser, type MembershipWithRole } from "../infra/memberships.repository.js";
import { membershipCache } from "./membership-cache.js";

/**
 * Used by `TenantGuard` on every authenticated request — see the http-layer
 * module for why this specific query is safe to run with a not-yet-verified
 * `tenantId` claim (short transaction, filtered by both RLS AND app-level
 * `user_id = ...`). Positive results are cached for a few seconds (see
 * membership-cache.ts) — this lookup otherwise costs a transaction on every
 * request.
 */
export async function getMembership(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<MembershipWithRole | undefined> {
  const cached = membershipCache.get(tenantId, userId);
  if (cached) return cached;
  const membership = await withTenantContext(db, tenantId, (tx) => getMembershipByUser(tx, tenantId, userId));
  if (membership) membershipCache.set(membership);
  return membership;
}
