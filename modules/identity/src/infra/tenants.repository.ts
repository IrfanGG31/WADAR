import type { Tx } from "@wadar/platform";
import { eq } from "drizzle-orm";
import type { TenantTimezone } from "@wadar/contracts";
import { tenants } from "../db/schema.js";

export interface NewTenantRow {
  id: string;
  name: string;
  timezone: TenantTimezone;
}

export async function insertTenant(tx: Tx, row: NewTenantRow): Promise<void> {
  await tx.insert(tenants).values(row);
}

export async function getTenantById(
  tx: Tx,
  tenantId: string,
): Promise<typeof tenants.$inferSelect | undefined> {
  const [row] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  return row;
}
