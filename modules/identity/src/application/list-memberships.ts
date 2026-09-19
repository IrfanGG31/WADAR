import { withTenantContext, type Db } from "@wadar/platform";
import { listMemberships } from "../infra/memberships.repository.js";

export async function listTenantMemberships(db: Db, tenantId: string) {
  return withTenantContext(db, tenantId, (tx) => listMemberships(tx, tenantId));
}
