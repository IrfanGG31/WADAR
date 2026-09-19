import { EventEnvelope, type TenantTimezone } from "@wadar/contracts";
import { insertAuditLog, insertOutboxPending, withTenantContext, type Db } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { SystemRole } from "../domain/role.js";
import { insertMembership } from "../infra/memberships.repository.js";
import { insertOutlet } from "../infra/outlets.repository.js";
import { insertSystemRoles } from "../infra/roles.repository.js";
import { insertTenant } from "../infra/tenants.repository.js";

export interface CreateTenantCommand {
  ownerUserId: string;
  tenantName: string;
  timezone: TenantTimezone;
  outletName: string;
  correlationId: string;
}

export interface CreateTenantResult {
  tenantId: string;
  outletId: string;
  membershipId: string;
}

/**
 * The onboarding command: brand-new tenant + first outlet + 5 seeded system
 * roles + the creator's own membership as Owner, all in one transaction
 * (CLAUDE.md aturan #5) — and, crucially, wrapped in `withTenantContext`
 * using the freshly generated `tenantId` BEFORE any tenant-scoped insert,
 * so the RLS `withCheck` policy on outlets/roles/memberships is satisfied
 * for a tenant that (from Postgres's point of view) didn't exist a moment
 * ago. `tenants` itself has no RLS (it's the root aggregate, see
 * `db/schema.ts`), so it's unaffected either way.
 */
export async function createTenant(db: Db, command: CreateTenantCommand): Promise<CreateTenantResult> {
  const tenantId = uuidv7();
  const outletId = uuidv7();
  const membershipId = uuidv7();
  const eventId = uuidv7();

  await withTenantContext(db, tenantId, async (tx) => {
    await insertTenant(tx, { id: tenantId, name: command.tenantName, timezone: command.timezone });
    const roleIdsByKey = await insertSystemRoles(tx, tenantId);
    await insertOutlet(tx, { id: outletId, tenantId, name: command.outletName });
    await insertMembership(tx, {
      id: membershipId,
      tenantId,
      userId: command.ownerUserId,
      roleId: roleIdsByKey[SystemRole.Owner],
    });
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId,
      actor: command.ownerUserId,
      action: "tenant.created",
      entity: `tenant:${tenantId}`,
      after: { name: command.tenantName, timezone: command.timezone },
    });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "identity.tenant.created",
      version: 1,
      tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user", id: command.ownerUserId },
      payload: { tenantId, outletId, name: command.tenantName },
    });
    await insertOutboxPending(tx, {
      id: eventId,
      tenantId,
      aggregateType: "tenant",
      aggregateId: tenantId,
      eventType: envelope.type,
      payload: envelope.payload,
    });
  });

  return { tenantId, outletId, membershipId };
}
