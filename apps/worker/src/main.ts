import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import * as Sentry from "@sentry/node";
import {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REDIS,
  PLATFORM_SCHEDULER,
  consumerQueueName,
  createIdempotentProcessor,
  wireDeadLetterQueue,
  type Db,
  type EventBus,
  type OutboxRelay,
  type ScheduledJobRegistry,
} from "@wadar/platform";
import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import pino from "pino";
import { AppModule } from "./app.module.js";
import { registerAllConsumers, registerAllScheduledJobs } from "./consumers/registry.js";
import { loadWorkerEnv } from "./env.js";

const env = loadWorkerEnv();
const logger = pino({ name: "wadar-worker" });

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(env), new FastifyAdapter());

  const db = app.get<Db>(PLATFORM_DB);
  const redis = app.get<Redis>(PLATFORM_REDIS);
  const eventBus = app.get<EventBus>(PLATFORM_EVENT_BUS);
  const relay = app.get<OutboxRelay>(PLATFORM_OUTBOX_RELAY);
  const scheduler = app.get<ScheduledJobRegistry>(PLATFORM_SCHEDULER);

  registerAllConsumers(app, eventBus, logger);
  registerAllScheduledJobs(app, scheduler, env);

  // One BullMQ worker per consumer (ARCHITECTURE §8 bulkhead): a slow or
  // failing consumer never blocks another's queue.
  const closers: Array<() => Promise<void>> = [];
  for (const consumerName of eventBus.allConsumerNames()) {
    const worker = new Worker(consumerQueueName(consumerName), createIdempotentProcessor(consumerName, eventBus, db), {
      connection: redis,
      concurrency: 5,
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id, consumer: consumerName, eventType: job?.name }, "consumer job failed");
    });
    wireDeadLetterQueue(consumerName, redis);
    closers.push(() => worker.close());
  }

  for (const job of scheduler.all()) {
    const queueName = `scheduled.${job.name}`;
    const queue = new Queue(queueName, { connection: redis });
    await queue.upsertJobScheduler(job.name, { every: job.everyMs }, { name: job.name, opts: { removeOnComplete: 50, removeOnFail: 50 } });
    const worker = new Worker(
      queueName,
      async () => {
        const started = Date.now();
        await job.run(db, logger.child({ job: job.name }));
        logger.info({ job: job.name, ms: Date.now() - started }, "scheduled job done");
      },
      { connection: redis, concurrency: 1 },
    );
    worker.on("failed", (_job, err) => logger.error({ err, job: job.name }, "scheduled job failed"));
    closers.push(async () => {
      await worker.close();
      await queue.close();
    });
  }

  relay.start();
  logger.info({ consumers: eventBus.allConsumerNames(), jobs: scheduler.all().map((j) => j.name) }, "outbox relay started");

  await app.listen(env.WORKER_HEALTH_PORT, "0.0.0.0");
  logger.info({ port: env.WORKER_HEALTH_PORT }, "wadar-worker health endpoint listening");

  process.on("SIGTERM", () => {
    void (async () => {
      await relay.stop();
      for (const close of closers) await close();
      await app.close();
    })();
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, "wadar-worker failed to start");
  process.exitCode = 1;
});
