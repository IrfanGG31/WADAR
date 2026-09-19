import { withTenantContext, type Db } from "@wadar/platform";
import { isInvitationAcceptable } from "../domain/invitation.js";
import { findInvitationByToken } from "../infra/invitations.repository.js";
import { getRoleById } from "../infra/roles.repository.js";
import { getTenantById } from "../infra/tenants.repository.js";

export interface InvitationPreview {
  tenantName: string;
  roleName: string;
  acceptable: boolean;
}

/**
 * Unauthenticated preview for the "kamu diundang" accept screen — the
 * person hasn't signed in yet, so this returns only what's safe to show
 * before authentication (no email/phone, no internal ids beyond the token
 * itself which the caller already has).
 */
export async function getInvitationPreview(db: Db, token: string): Promise<InvitationPreview | undefined> {
  const invitation = await findInvitationByToken(db, token);
  if (!invitation) return undefined;

  return withTenantContext(db, invitation.tenantId, async (tx) => {
    const [tenant, role] = await Promise.all([
      getTenantById(tx, invitation.tenantId),
      getRoleById(tx, invitation.tenantId, invitation.roleId),
    ]);
    return {
      tenantName: tenant?.name ?? "",
      roleName: role?.name ?? "",
      acceptable: isInvitationAcceptable(invitation),
    };
  });
}
