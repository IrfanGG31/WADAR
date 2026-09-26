import type { Job } from "bullmq";
import { sql } from "drizzle-orm";
import { tryClaimProcessing } from "../infra/processed-events.repository.js";
import type { Db } from "../infra/db.js";
import type { EventBus } from "./event-bus.js";

export interface OutboxJobData {
  eventId: string;
  tenantId: string;
  eventType: string;
  payload: unknown;
}

/**
 * Wraps a registered handler so every BullMQ delivery — including redeliveries
 * after a crash or retry — is idempotent. `tryClaimProcessing` + the handler's
 * own DB effect run in ONE transaction: if the handler's effect is itself a DB
 * write, this guarantee is airtight. For handlers whose effect is a
 * non-transactional external call (e.g. sending WhatsApp in M9, calling an LLM
 * in M8), this pattern reduces but does not fully eliminate duplicates — those
 * modules need their own idempotency at the external provider boundary too.
 */
export function createIdempotentProcessor(
  consumerName: string,
  eventBus: EventBus,
  db: Db,
): (job: Job<OutboxJobData>) => Promise<void> {
  return async (job) => {
    const { eventId, tenantId, eventType, payload } = job.data;
    const handler = eventBus.handlerFor(eventType, consumerName);
    if (!handler) {
      throw new Error(`No handler registered for consumer="${consumerName}" eventType="${eventType}"`);
    }

    await db.transaction(async (tx) => {
      // Handlers write to RLS-protected tables in their own module schemas,
      // so the tenant context must be set here — the job's tenantId comes
      // from the outbox row, never from an untrusted caller.
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const claimed = await tryClaimProcessing(tx, consumerName, eventId, tenantId);
      if (!claimed) return; // already processed by a previous delivery — skip, no error
      await handler(tx, payload, tenantId, { eventId, eventType });
    });
  };
}
