import { withTenantContext, type Db } from "@wadar/platform";
import { listInvitations } from "../infra/invitations.repository.js";

export async function listTenantInvitations(db: Db, tenantId: string) {
  return withTenantContext(db, tenantId, (tx) => listInvitations(tx, tenantId));
}
