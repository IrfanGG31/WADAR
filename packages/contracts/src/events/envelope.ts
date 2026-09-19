import { z } from "zod";

/**
 * Event envelope shared by every domain event published through the outbox.
 * Mirrors docs/ARCHITECTURE.md §4.2 exactly — this is the single source of truth,
 * modules must not redefine their own envelope shape.
 */
export const EventEnvelope = z.object({
  id: z.uuid(), // UUIDv7, also the idempotency key for processed_events
  type: z.string(), // e.g. "sales.order.completed"
  version: z.number().int().positive(),
  tenantId: z.uuid(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  actor: z.object({
    kind: z.enum(["user", "system", "ai", "webhook"]),
    id: z.string().optional(),
  }),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof EventEnvelope>;
