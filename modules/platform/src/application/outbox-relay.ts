import type { ConnectionOptions, Queue } from "bullmq";
import type { Logger } from "pino";
import type { Db } from "../infra/db.js";
import { claimPendingBatch, markPublished } from "../infra/outbox.repository.js";
import { DEFAULT_JOB_OPTIONS, consumerQueueName, createConsumerQueue } from "../infra/queues.js";
import type { EventBus } from "./event-bus.js";

export interface OutboxRelayOptions {
  pollIntervalMs?: number;
  batchSize?: number;
}

/**
 * Polls `platform.outbox` and fans pending events out to one BullMQ queue per
 * interested consumer (docs/ARCHITECTURE.md §4.3).
 *
 * LISTEN/NOTIFY (mentioned in §4.3 alongside polling) is deliberately NOT
 * implemented here — it's a latency optimization, not a correctness
 * requirement, and polling every 250ms already satisfies the M0 DoD. Revisit
 * post-M0 if event latency becomes a problem.
 *
 * Ordering is the part that matters for correctness: a row is only marked
 * `published` AFTER every consumer queue confirms the job was enqueued. If
 * the process crashes between enqueue and commit, the row stays `pending`
 * and gets republished next tick — a duplicate, which `processed_events`
 * handles (see idempotent-consumer.ts). The reverse order (marking
 * `published` first) would risk silently losing the event if publish then
 * failed, violating ARCHITECTURE §8.
 */
export class OutboxRelay {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly queues = new Map<string, Queue>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    private readonly db: Db,
    private readonly eventBus: EventBus,
    private readonly connection: ConnectionOptions,
    private readonly logger: Logger,
    options: OutboxRelayOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.batchSize = options.batchSize ?? 20;
  }

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  private getQueue(consumerName: string): Queue {
    let queue = this.queues.get(consumerName);
    if (!queue) {
      queue = createConsumerQueue(consumerName, this.connection);
      this.queues.set(consumerName, queue);
    }
    return queue;
  }

  /** Exposed for tests — runs exactly one poll cycle instead of waiting for the interval. */
  async tick(): Promise<void> {
    if (this.ticking) return; // avoid overlapping ticks if one runs long
    this.ticking = true;
    try {
      await this.db.transaction(async (tx) => {
        const claimed = await claimPendingBatch(tx, this.batchSize);
        if (claimed.length === 0) return;

        const publishedIds: string[] = [];
        for (const row of claimed) {
          const consumers = this.eventBus.consumersFor(row.eventType);
          try {
            await Promise.all(
              consumers.map((consumerName) =>
                this.getQueue(consumerName).add(
                  row.eventType,
                  {
                    eventId: row.id,
                    tenantId: row.tenantId,
                    eventType: row.eventType,
                    payload: row.payload,
                  },
                  { jobId: row.id, ...DEFAULT_JOB_OPTIONS },
                ),
              ),
            );
            publishedIds.push(row.id);
          } catch (error) {
            this.logger.error(
              { err: error, eventId: row.id, eventType: row.eventType },
              "outbox-relay: publish failed, leaving row pending for retry",
            );
          }
        }
        await markPublished(tx, publishedIds);
      });
    } catch (error) {
      // A transient DB/Redis outage must never crash the whole worker
      // process — found by actually running the worker against an
      // unreachable database, where an uncaught rejection here took the
      // process down. Log and let the next scheduled tick retry instead.
      this.logger.error({ err: error }, "outbox-relay: tick failed, will retry next interval");
    } finally {
      this.ticking = false;
    }
  }
}

export { consumerQueueName };
