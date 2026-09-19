import type { Tx } from "@wadar/platform";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { SYSTEM_ROLES, SYSTEM_ROLE_DISPLAY_NAME, type SystemRole } from "../domain/role.js";
import { roles } from "../db/schema.js";

/** Seeds the 5 fixed system roles for a brand-new tenant (design decision #5). */
export async function insertSystemRoles(
  tx: Tx,
  tenantId: string,
): Promise<Record<SystemRole, string>> {
  const roleIdsByKey = {} as Record<SystemRole, string>;
  const rows = SYSTEM_ROLES.map((key) => {
    const id = uuidv7();
    roleIdsByKey[key] = id;
    return { id, tenantId, key, name: SYSTEM_ROLE_DISPLAY_NAME[key] };
  });
  await tx.insert(roles).values(rows);
  return roleIdsByKey;
}

export async function getRoleByKey(
  tx: Tx,
  tenantId: string,
  key: SystemRole,
): Promise<typeof roles.$inferSelect | undefined> {
  const [row] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.key, key)));
  return row;
}

export async function getRoleById(
  tx: Tx,
  tenantId: string,
  roleId: string,
): Promise<typeof roles.$inferSelect | undefined> {
  const [row] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)));
  return row;
}

export async function listRoles(tx: Tx, tenantId: string): Promise<Array<typeof roles.$inferSelect>> {
  return tx.select().from(roles).where(eq(roles.tenantId, tenantId));
}
