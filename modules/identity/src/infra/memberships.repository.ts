import type { Db, Tx } from "@wadar/platform";
import { and, asc, eq, sql } from "drizzle-orm";
import { memberships, roles, tenants } from "../db/schema.js";

export interface NewMembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
}

export async function insertMembership(tx: Tx, row: NewMembershipRow): Promise<void> {
  await tx.insert(memberships).values(row);
}

export interface MembershipWithRole {
  membershipId: string;
  tenantId: string;
  userId: string;
  roleId: string;
  roleKey: (typeof roles.$inferSelect)["key"];
  roleName: string;
}

export async function getMembershipByUser(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<MembershipWithRole | undefined> {
  const [row] = await tx
    .select({
      membershipId: memberships.id,
      tenantId: memberships.tenantId,
      userId: memberships.userId,
      roleId: memberships.roleId,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));
  return row;
}

export async function listMemberships(tx: Tx, tenantId: string): Promise<MembershipWithRole[]> {
  return tx
    .select({
      membershipId: memberships.id,
      tenantId: memberships.tenantId,
      userId: memberships.userId,
      roleId: memberships.roleId,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(eq(memberships.tenantId, tenantId));
}

export async function updateMembershipRole(
  tx: Tx,
  membershipId: string,
  roleId: string,
): Promise<void> {
  await tx.update(memberships).set({ roleId }).where(eq(memberships.id, membershipId));
}

export async function getMembershipById(
  tx: Tx,
  tenantId: string,
  membershipId: string,
): Promise<typeof memberships.$inferSelect | undefined> {
  const [row] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
  return row;
}

/**
 * Every shop `userId` belongs to, across tenants — the one cross-tenant read
 * a signed-in user needs before choosing a shop. Goes through the
 * `own_membership_lookup` RLS policy (SELECT, own rows only); tenant_isolation
 * is pinned to the nil UUID so it matches nothing instead of throwing (same
 * technique as findInvitationByToken). `userId` must come from the verified
 * JWT, never from request input.
 */
export async function listTenantsForUser(db: Db, userId: string): Promise<Array<{ tenantId: string; name: string }>> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true)`);
    await tx.execute(sql`select set_config('app.membership_lookup_user', ${userId}, true)`);
    return tx
      .select({ tenantId: tenants.id, name: tenants.name })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt));
  });
}
