import { EventEnvelope, type SystemRoleKey } from "@wadar/contracts";
import { insertAuditLog, insertOutboxPending, withTenantContext, type Db } from "@wadar/platform";
import { randomBytes } from "node:crypto";
import { uuidv7 } from "uuidv7";
import { computeInvitationExpiry } from "../domain/invitation.js";
import type { SystemRole } from "../domain/role.js";
import { insertInvitation } from "../infra/invitations.repository.js";
import { getRoleByKey } from "../infra/roles.repository.js";

export class RoleNotFoundError extends Error {
  constructor(roleKey: string) {
    super(`role "${roleKey}" not found for this tenant`);
    this.name = "RoleNotFoundError";
  }
}

export interface InviteMemberCommand {
  tenantId: string;
  invitedByUserId: string;
  email?: string;
  phone?: string;
  roleKey: SystemRoleKey;
  correlationId: string;
}

export interface InviteMemberResult {
  invitationId: string;
  token: string;
  expiresAt: Date;
}

export async function inviteMember(db: Db, command: InviteMemberCommand): Promise<InviteMemberResult> {
  const invitationId = uuidv7();
  const eventId = uuidv7();
  // High-entropy, unguessable — also the RLS escape-hatch key for
  // accept-invitation's tenant-agnostic lookup (db/schema.ts's
  // `invitation_token_lookup` policy), so it must never be sequential.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = computeInvitationExpiry();

  await withTenantContext(db, command.tenantId, async (tx) => {
    const role = await getRoleByKey(tx, command.tenantId, command.roleKey as SystemRole);
    if (!role) throw new RoleNotFoundError(command.roleKey);

    await insertInvitation(tx, {
      id: invitationId,
      tenantId: command.tenantId,
      email: command.email,
      phone: command.phone,
      roleId: role.id,
      token,
      invitedBy: command.invitedByUserId,
      expiresAt,
    });

    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: command.tenantId,
      actor: command.invitedByUserId,
      action: "invitation.created",
      entity: `invitation:${invitationId}`,
      after: { email: command.email, phone: command.phone, roleKey: command.roleKey },
    });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "identity.invitation.created",
      version: 1,
      tenantId: command.tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user", id: command.invitedByUserId },
      payload: {
        invitationId,
        email: command.email,
        phone: command.phone,
        roleKey: command.roleKey,
      },
    });
    await insertOutboxPending(tx, {
      id: eventId,
      tenantId: command.tenantId,
      aggregateType: "invitation",
      aggregateId: invitationId,
      eventType: envelope.type,
      payload: envelope.payload,
    });
  });

  return { invitationId, token, expiresAt };
}
