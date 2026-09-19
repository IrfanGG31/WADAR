import { EventEnvelope, type SystemRoleKey } from "@wadar/contracts";
import { insertAuditLog, insertOutboxPending, withTenantContext, type Db } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import type { SystemRole } from "../domain/role.js";
import { getMembershipById, updateMembershipRole } from "../infra/memberships.repository.js";
import { getRoleByKey } from "../infra/roles.repository.js";

export class MembershipNotFoundError extends Error {
  constructor() {
    super("membership not found");
    this.name = "MembershipNotFoundError";
  }
}
export class RoleNotFoundError extends Error {
  constructor(roleKey: string) {
    super(`role "${roleKey}" not found for this tenant`);
    this.name = "RoleNotFoundError";
  }
}

export interface ChangeRoleCommand {
  tenantId: string;
  membershipId: string;
  newRoleKey: SystemRoleKey;
  actorUserId: string;
  correlationId: string;
}

/** ARCHITECTURE §9: "ubah peran" is a sensitive action and must be audited. */
export async function changeRole(db: Db, command: ChangeRoleCommand): Promise<void> {
  const eventId = uuidv7();

  await withTenantContext(db, command.tenantId, async (tx) => {
    const membership = await getMembershipById(tx, command.tenantId, command.membershipId);
    if (!membership) throw new MembershipNotFoundError();

    const newRole = await getRoleByKey(tx, command.tenantId, command.newRoleKey as SystemRole);
    if (!newRole) throw new RoleNotFoundError(command.newRoleKey);

    const previousRoleId = membership.roleId;
    await updateMembershipRole(tx, command.membershipId, newRole.id);

    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: command.tenantId,
      actor: command.actorUserId,
      action: "membership.role_changed",
      entity: `membership:${command.membershipId}`,
      before: { roleId: previousRoleId },
      after: { roleId: newRole.id, roleKey: command.newRoleKey },
    });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "identity.membership.roleChanged",
      version: 1,
      tenantId: command.tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user", id: command.actorUserId },
      payload: {
        membershipId: command.membershipId,
        roleId: newRole.id,
        roleKey: command.newRoleKey,
      },
    });
    await insertOutboxPending(tx, {
      id: eventId,
      tenantId: command.tenantId,
      aggregateType: "membership",
      aggregateId: command.membershipId,
      eventType: envelope.type,
      payload: envelope.payload,
    });
  });
}
