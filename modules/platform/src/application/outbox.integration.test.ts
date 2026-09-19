import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Worker } from "bullmq";
import pino from "pino";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../infra/db.js";
import { createRedisConnection } from "../infra/redis.js";
import { consumerQueueName } from "../infra/queues.js";
import { EventBus } from "./event-bus.js";
import { createIdempotentProcessor, type OutboxJobData } from "./idempotent-consumer.js";
import { OutboxRelay } from "./outbox-relay.js";
import { createPing } from "./ping-command.js";

/**
 * NOTE for whoever runs this next: this suite needs Docker to pull
 * `pgvector/pgvector:pg16` and `redis:7-alpine`. It could NOT be executed in
 * the sandbox that authored it (Docker Hub pulls are blocked by that
 * sandbox's egress policy — confirmed via the proxy's recentRelayFailures,
 * not a flaky network issue). It should run normally in GitHub Actions CI
 * and on a real dev machine with Docker. Run it there before trusting it.
 */
const execFileAsync = promisify(execFile);
const moduleRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("outbox relay + idempotent consumer (Testcontainers Postgres+Redis)", () => {
  let pgContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let databaseUrl: string;
  let redisUrl: string;

  beforeAll(async () => {
    pgContainer = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({
        POSTGRES_USER: "wadar",
        POSTGRES_PASSWORD: "wadar",
        POSTGRES_DB: "wadar",
      })
      .withExposedPorts(5432)
      .start();
    databaseUrl = `postgres://wadar:wadar@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/wadar`;

    redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    await execFileAsync(
      "pnpm",
      ["exec", "drizzle-kit", "push", "--config=drizzle.config.ts", "--force"],
      { cwd: moduleRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
  }, 180_000);

  afterAll(async () => {
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  async function setup() {
    const { db } = createDb(databaseUrl);
    const redis = createRedisConnection(redisUrl);
    const eventBus = new EventBus();
    const logger = pino({ level: "silent" });
    const relay = new OutboxRelay(db, eventBus, redis, logger, { pollIntervalMs: 100_000 });
    return { db, redis, eventBus, relay };
  }

  it("delivers a published event to its real BullMQ queue exactly-effect-once even when redelivered twice", async () => {
    const { db, redis, eventBus, relay } = await setup();
    const consumerName = "dummy-consumer";
    let effectCount = 0;

    eventBus.registerHandler("platform.ping.created", consumerName, async () => {
      effectCount += 1;
    });

    const { eventId, pingId } = await createPing(db, {
      tenantId: "018f2f1e-7b1a-7b1a-8b1a-000000000010",
      message: "hello",
      correlationId: "corr-1",
    });

    // Drives the real relay pipeline: claim the pending row, publish to the
    // real BullMQ queue, mark it published — not a bypassed direct call.
    await relay.tick();

    const worker = new Worker<OutboxJobData>(
      consumerQueueName(consumerName),
      createIdempotentProcessor(consumerName, eventBus, db),
      { connection: redis },
    );

    try {
      await worker.waitUntilReady();

      // Wait for the real BullMQ delivery to complete.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for job")), 15_000);
        worker.on("completed", (job) => {
          if (job.id === eventId) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.on("failed", (_job, err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(effectCount).toBe(1);

      // Redelivery through the REAL pipeline (not a bypassed manual call):
      // re-enqueue the same job id directly on the queue, exercising BullMQ's
      // own dedupe-by-id AND, more importantly, processed_events underneath it.
      const q = new (await import("bullmq")).Queue(consumerQueueName(consumerName), {
        connection: redis,
      });
      try {
        // removeOnComplete removed the original job; add a fresh job with the
        // SAME event id in its payload to simulate a genuine redelivery
        // (e.g. after a worker crash and BullMQ's stalled-job recovery).
        await q.add("platform.ping.created", {
          eventId,
          tenantId: "018f2f1e-7b1a-7b1a-8b1a-000000000010",
          eventType: "platform.ping.created",
          payload: { pingId, message: "hello" },
        } satisfies OutboxJobData);
      } finally {
        await q.close();
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for redelivery")), 15_000);
        worker.on("completed", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // processed_events' composite PK rejected the duplicate insert, so the
      // handler's effect never ran a second time.
      expect(effectCount).toBe(1);
    } finally {
      await worker.close();
    }
  }, 60_000);

  it("keeps the outbox row pending (never marks published) if publish fails, and recovers once Redis is reachable again", async () => {
    const { db, eventBus, relay } = await setup();
    eventBus.registerHandler("platform.ping.created", "resilience-consumer", async () => {});

    // Simulate a broken publish by pointing the relay at an unreachable Redis.
    const brokenRedis = createRedisConnection("redis://127.0.0.1:1"); // nothing listens here
    brokenRedis.on("error", () => {}); // expected — don't let it crash the test
    const brokenRelay = new OutboxRelay(db, eventBus, brokenRedis, pino({ level: "silent" }), {
      pollIntervalMs: 100_000,
    });

    const { eventId } = await createPing(db, {
      tenantId: "018f2f1e-7b1a-7b1a-8b1a-000000000011",
      message: "should stay pending",
      correlationId: "corr-2",
    });

    await brokenRelay.tick();

    const { outbox } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const [rowAfterFailure] = await db.select().from(outbox).where(eq(outbox.id, eventId));
    expect(rowAfterFailure?.status).toBe("pending");
    expect(rowAfterFailure?.publishedAt).toBeNull();

    await brokenRedis.quit().catch(() => {});

    // Now retry with a working relay — the row should recover with no data loss.
    await relay.tick();
    const [rowAfterRecovery] = await db.select().from(outbox).where(eq(outbox.id, eventId));
    expect(rowAfterRecovery?.status).toBe("published");
  }, 30_000);
});
