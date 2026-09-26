import type { TenantTimezone } from "@wadar/contracts";
import type { Db, Tx } from "@wadar/platform";
import { and, eq } from "drizzle-orm";
import { outlets, tenants } from "../db/schema.js";

/**
 * Synchronous ports other modules call in-process (ARCHITECTURE §4.1).
 * Each takes the CALLER's transaction (already inside `withTenantContext`)
 * so the read shares the caller's tenant context and snapshot.
 */
export async function getTenantTimezone(tx: Tx, tenantId: string): Promise<TenantTimezone> {
  const [row] = await tx.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId));
  return row?.timezone ?? "Asia/Jakarta";
}

export async function outletBelongsToTenant(tx: Tx, tenantId: string, outletId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.id, outletId)));
  return row !== undefined;
}

export async function listTenantOutletIds(tx: Tx, tenantId: string): Promise<string[]> {
  const rows = await tx.select({ id: outlets.id }).from(outlets).where(eq(outlets.tenantId, tenantId));
  return rows.map((row) => row.id);
}

/**
 * Every tenant (id + timezone) — for system jobs that iterate tenants
 * (nightly forecast, reconciliation). `tenants` is the root aggregate with
 * no RLS, so this needs no tenant context.
 */
export async function listAllTenants(db: Db): Promise<Array<{ id: string; timezone: TenantTimezone }>> {
  return db.select({ id: tenants.id, timezone: tenants.timezone }).from(tenants);
}
