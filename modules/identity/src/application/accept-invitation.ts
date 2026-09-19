import { EventEnvelope } from "@wadar/contracts";
import { insertAuditLog, insertOutboxPending, withTenantContext, type Db } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { isInvitationAcceptable } from "../domain/invitation.js";
import {
  findInvitationByToken,
  getInvitationById,
  markInvitationAccepted,
} from "../infra/invitations.repository.js";
import { getMembershipByUser, insertMembership } from "../infra/memberships.repository.js";
import { getRoleById } from "../infra/roles.repository.js";

export class InvitationNotFoundError extends Error {
  constructor() {
    super("invitation not found");
    this.name = "InvitationNotFoundError";
  }
}
export class InvitationNotAcceptableError extends Error {
  constructor() {
    super("invitation is expired, already used, or revoked");
    this.name = "InvitationNotAcceptableError";
  }
}
export class AlreadyMemberError extends Error {
  constructor() {
    super("user is already a member of this tenant");
    this.name = "AlreadyMemberError";
  }
}

export interface AcceptInvitationCommand {
  token: string;
  acceptingUserId: string;
  correlationId: string;
}

export interface AcceptInvitationResult {
  tenantId: string;
  membershipId: string;
  roleKey: string;
}

/**
 * The accepting user isn't a member of any tenant yet, so this can't start
 * with `withTenantContext` — it first resolves the invitation's tenantId
 * via the token-scoped RLS escape hatch (`findInvitationByToken`, see
 * `db/schema.ts`), THEN opens a normal tenant-scoped transaction for the
 * actual mutation. The invitation is re-checked (status + expiry) a second
 * time inside that transaction — the first check is just a fast-path
 * rejection; a concurrent accept of the same token between the two steps is
 * still caught here, not assumed away.
 */
export async function acceptInvitation(
  db: Db,
  command: AcceptInvitationCommand,
): Promise<AcceptInvitationResult> {
  const invitation = await findInvitationByToken(db, command.token);
  if (!invitation) throw new InvitationNotFoundError();
  if (!isInvitationAcceptable(invitation)) throw new InvitationNotAcceptableError();

  const membershipId = uuidv7();
  const eventId = uuidv7();

  const roleKey = await withTenantContext(db, invitation.tenantId, async (tx) => {
    const fresh = await getInvitationById(tx, invitation.tenantId, invitation.id);
    if (!fresh || !isInvitationAcceptable(fresh)) throw new InvitationNotAcceptableError();

    const existingMembership = await getMembershipByUser(tx, invitation.tenantId, command.acceptingUserId);
    if (existingMembership) throw new AlreadyMemberError();

    const role = await getRoleById(tx, invitation.tenantId, invitation.roleId);
    if (!role) throw new InvitationNotAcceptableError();

    await insertMembership(tx, {
      id: membershipId,
      tenantId: invitation.tenantId,
      userId: command.acceptingUserId,
      roleId: invitation.roleId,
    });
    await markInvitationAccepted(tx, invitation.id);
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: invitation.tenantId,
      actor: command.acceptingUserId,
      action: "invitation.accepted",
      entity: `invitation:${invitation.id}`,
    });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "identity.membership.created",
      version: 1,
      tenantId: invitation.tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user", id: command.acceptingUserId },
      payload: { membershipId, userId: command.acceptingUserId, roleId: invitation.roleId },
    });
    await insertOutboxPending(tx, {
      id: eventId,
      tenantId: invitation.tenantId,
      aggregateType: "membership",
      aggregateId: membershipId,
      eventType: envelope.type,
      payload: envelope.payload,
    });

    return role.key;
  });

  return { tenantId: invitation.tenantId, membershipId, roleKey };
}
