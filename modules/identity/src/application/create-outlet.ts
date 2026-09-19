import { EventEnvelope } from "@wadar/contracts";
import { insertAuditLog, insertOutboxPending, withTenantContext, type Db } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { insertOutlet } from "../infra/outlets.repository.js";

export interface CreateOutletCommand {
  tenantId: string;
  name: string;
  address?: string;
  actorUserId: string;
  correlationId: string;
}

export interface CreateOutletResult {
  outletId: string;
}

export async function createOutlet(db: Db, command: CreateOutletCommand): Promise<CreateOutletResult> {
  const outletId = uuidv7();
  const eventId = uuidv7();

  await withTenantContext(db, command.tenantId, async (tx) => {
    await insertOutlet(tx, {
      id: outletId,
      tenantId: command.tenantId,
      name: command.name,
      address: command.address,
    });
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: command.tenantId,
      actor: command.actorUserId,
      action: "outlet.created",
      entity: `outlet:${outletId}`,
      after: { name: command.name, address: command.address },
    });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "identity.outlet.created",
      version: 1,
      tenantId: command.tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user", id: command.actorUserId },
      payload: { outletId, name: command.name },
    });
    await insertOutboxPending(tx, {
      id: eventId,
      tenantId: command.tenantId,
      aggregateType: "outlet",
      aggregateId: outletId,
      eventType: envelope.type,
      payload: envelope.payload,
    });
  });

  return { outletId };
}
