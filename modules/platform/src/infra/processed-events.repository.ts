import { processedEvents } from "../db/schema.js";
import type { Tx } from "./outbox.repository.js";

/**
 * Atomically claims the right to process (consumer, eventId) once. The
 * composite primary key on `processed_events` is the actual safety net —
 * `ON CONFLICT DO NOTHING` makes a concurrent or repeated delivery insert
 * zero rows instead of raising (a raised unique violation would also abort
 * the surrounding transaction, and Drizzle wraps the pg error so its
 * SQLSTATE isn't at the top level anyway).
 *
 * Caller must run the consumer's effect and this insert in the SAME
 * transaction (docs/ARCHITECTURE.md §4.3) — pass the effect's own `tx`.
 *
 * @returns true if this call newly claimed processing rights (proceed with
 *   the effect); false if another call already processed this event (skip).
 */
export async function tryClaimProcessing(
  tx: Tx,
  consumer: string,
  eventId: string,
  tenantId: string,
): Promise<boolean> {
  const inserted = await tx
    .insert(processedEvents)
    .values({ consumer, eventId, tenantId })
    .onConflictDoNothing()
    .returning({ eventId: processedEvents.eventId });
  return inserted.length === 1;
}
