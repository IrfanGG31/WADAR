import type { MyTenantView } from "@wadar/contracts";
import type { Db } from "@wadar/platform";
import { listTenantsForUser } from "../infra/memberships.repository.js";

/** Shops the caller belongs to (their own memberships only), oldest first. */
export async function listMyTenants(db: Db, userId: string): Promise<MyTenantView[]> {
  return listTenantsForUser(db, userId);
}
