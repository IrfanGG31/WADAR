import { Queue, QueueEvents, type ConnectionOptions, type Job } from "bullmq";

/**
 * One BullMQ queue per consumer (ARCHITECTURE §8 bulkhead pattern — a slow or
 * failing consumer never blocks another). Job id = event id, so BullMQ's own
 * dedupe-by-id is a second (not primary) line of defense on top of
 * `processed_events`.
 */
// BullMQ forbids ":" in queue names (it uses that as its own Redis key
// separator internally) — found by actually running the worker, not by
// inspection. "." is safe and keeps the name readable.
export function consumerQueueName(consumerName: string): string {
  return `consumer.${consumerName}`;
}

export function dlqQueueName(consumerName: string): string {
  return `${consumerQueueName(consumerName)}.dlq`;
}

/** ARCHITECTURE §4.3: retry eksponensial 5x, maks ~10 menit total. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 15_000 }, // 15s,30s,60s,120s,240s ≈ 7.75min
  removeOnComplete: { age: 3600 },
  removeOnFail: false,
};

export function createConsumerQueue(
  consumerName: string,
  connection: ConnectionOptions,
): Queue {
  return new Queue(consumerQueueName(consumerName), { connection });
}

export function createDlqQueue(consumerName: string, connection: ConnectionOptions): Queue {
  return new Queue(dlqQueueName(consumerName), { connection });
}

/**
 * Full DoD (docs/BUILD-PLAN.md M0) only asks for the retry pattern + queue
 * structure to exist; alerting on DLQ depth is M11 scope. Moving exhausted
 * jobs into the DLQ queue itself is wired here so the mechanism works end to
 * end from M0 onward.
 */
export function wireDeadLetterQueue(
  consumerName: string,
  connection: ConnectionOptions,
): QueueEvents {
  const events = new QueueEvents(consumerQueueName(consumerName), { connection });
  const dlq = createDlqQueue(consumerName, connection);

  events.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    void (async () => {
      const queue = createConsumerQueue(consumerName, connection);
      const job: Job | undefined = await queue.getJob(jobId);
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await dlq.add("dead-letter", { originalJobId: jobId, data: job.data, failedReason });
      }
      await queue.close();
    })();
  });

  return events;
}
