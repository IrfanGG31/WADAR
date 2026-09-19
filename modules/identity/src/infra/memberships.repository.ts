import type { Tx } from "@wadar/platform";
import { and, eq } from "drizzle-orm";
import { memberships, roles } from "../db/schema.js";

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
