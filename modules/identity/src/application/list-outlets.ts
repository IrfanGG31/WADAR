import { withTenantContext, type Db } from "@wadar/platform";
import { listOutlets } from "../infra/outlets.repository.js";

export async function listTenantOutlets(db: Db, tenantId: string) {
  return withTenantContext(db, tenantId, (tx) => listOutlets(tx, tenantId));
}
