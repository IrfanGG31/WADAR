import { EventEnvelope } from "@wadar/contracts";
import { uuidv7 } from "uuidv7";
import type { Db } from "../infra/db.js";
import { insertOutboxPending } from "../infra/outbox.repository.js";
import { insertPing } from "../infra/ping.repository.js";

export interface CreatePingCommand {
  tenantId: string;
  message: string;
  correlationId: string;
}

export interface CreatePingResult {
  pingId: string;
  eventId: string;
}

/**
 * Dummy command used only to exercise the outbox pattern end to end for M0's
 * DoD (docs/BUILD-PLAN.md). Not a real business command — later milestones'
 * commands live in their own modules, not here.
 */
export async function createPing(db: Db, command: CreatePingCommand): Promise<CreatePingResult> {
  const pingId = uuidv7();
  const eventId = uuidv7();

  await db.transaction(async (tx) => {
    await insertPing(tx, { id: pingId, tenantId: command.tenantId, message: command.message });

    const envelope = EventEnvelope.parse({
      id: eventId,
      type: "platform.ping.created",
      version: 1,
      tenantId: command.tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: command.correlationId,
      actor: { kind: "user" },
      payload: { pingId, message: command.message },
    });

    await insertOutboxPending(tx, {
      id: eventId,
      tenantId: command.tenantId,
      aggregateType: "ping",
      aggregateId: pingId,
      eventType: envelope.type,
      payload: envelope.payload,
    });
  });

  return { pingId, eventId };
}
