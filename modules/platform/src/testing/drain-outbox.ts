import type { Job } from "bullmq";
import { createIdempotentProcessor, type OutboxJobData } from "../application/idempotent-consumer.js";
import type { EventBus } from "../application/event-bus.js";
import type { Db } from "../infra/db.js";
import { claimPendingBatch, markPublished } from "../infra/outbox.repository.js";

/**
 * Test-only stand-in for relay + BullMQ: repeatedly takes pending outbox
 * rows and runs every registered consumer through the SAME idempotent
 * processor the worker uses, until no event is left (consumers can emit
 * further events). Returns how many deliveries ran.
 *
 * `deliverTwice` re-delivers every event a second time to prove consumers
 * are idempotent (ARCHITECTURE §4.3: at-least-once delivery).
 */
export async function drainOutboxForTesting(
  db: Db,
  eventBus: EventBus,
  options: { deliverTwice?: boolean; maxRounds?: number } = {},
): Promise<number> {
  let deliveries = 0;
  for (let round = 0; round < (options.maxRounds ?? 50); round++) {
    const batch = await db.transaction(async (tx) => {
      const rows = await claimPendingBatch(tx, 500);
      await markPublished(tx, rows.map((r) => r.id));
      return rows;
    });
    if (batch.length === 0) return deliveries;
    for (const row of batch) {
      for (const consumer of eventBus.consumersFor(row.eventType)) {
        const processor = createIdempotentProcessor(consumer, eventBus, db);
        const job = {
          data: { eventId: row.id, tenantId: row.tenantId, eventType: row.eventType, payload: row.payload },
        } as Job<OutboxJobData>;
        await processor(job);
        if (options.deliverTwice) await processor(job);
        deliveries += 1;
      }
    }
  }
  throw new Error("drainOutboxForTesting: events kept producing events past maxRounds");
}
