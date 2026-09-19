import { withTenantContext, type Db } from "@wadar/platform";
import { getTenantById } from "../infra/tenants.repository.js";

export async function getTenant(db: Db, tenantId: string) {
  return withTenantContext(db, tenantId, (tx) => getTenantById(tx, tenantId));
}
