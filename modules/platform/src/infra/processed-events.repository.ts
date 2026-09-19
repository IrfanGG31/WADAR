import { processedEvents } from "../db/schema.js";
import type { Tx } from "./outbox.repository.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

interface PgError {
  code?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PgError).code === POSTGRES_UNIQUE_VIOLATION
  );
}

/**
 * Atomically claims the right to process (consumer, eventId) once. The
 * composite primary key on `processed_events` is the actual safety net — a
 * concurrent duplicate insert fails with a unique-violation, which we treat
 * as "already processed, skip" rather than an error. This is stronger than a
 * separate "check, then insert" (which has a TOCTOU race under concurrency).
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
  try {
    await tx.insert(processedEvents).values({ consumer, eventId, tenantId });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}
