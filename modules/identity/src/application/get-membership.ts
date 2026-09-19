import { withTenantContext, type Db } from "@wadar/platform";
import { getMembershipByUser, type MembershipWithRole } from "../infra/memberships.repository.js";

/**
 * Used by `TenantGuard` on every authenticated request — see the http-layer
 * module for why this specific query is safe to run with a not-yet-verified
 * `tenantId` claim (short transaction, filtered by both RLS AND app-level
 * `user_id = ...`).
 */
export async function getMembership(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<MembershipWithRole | undefined> {
  return withTenantContext(db, tenantId, (tx) => getMembershipByUser(tx, tenantId, userId));
}
