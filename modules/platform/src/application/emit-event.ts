import { EventEnvelope } from "@wadar/contracts";
import { uuidv7 } from "uuidv7";
import { insertOutboxPending, type Tx } from "../infra/outbox.repository.js";

export interface EmitEventInput {
  type: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  actor: { kind: "user" | "system" | "ai" | "webhook"; id?: string };
  payload: unknown;
  version?: number;
}

/**
 * Validates the envelope (docs/ARCHITECTURE.md §4.2) and writes the outbox
 * row inside the caller's transaction (CLAUDE.md aturan #5). Returns the
 * event id so callers can use it as a causation id downstream.
 */
export async function emitEvent(tx: Tx, input: EmitEventInput): Promise<string> {
  const id = uuidv7();
  const envelope = EventEnvelope.parse({
    id,
    type: input.type,
    version: input.version ?? 1,
    tenantId: input.tenantId,
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId,
    causationId: input.causationId,
    actor: input.actor,
    payload: input.payload,
  });
  await insertOutboxPending(tx, {
    id,
    tenantId: input.tenantId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: envelope.type,
    payload: envelope.payload,
  });
  return id;
}
