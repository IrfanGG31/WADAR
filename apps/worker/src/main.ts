import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import * as Sentry from "@sentry/node";
import {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REDIS,
  consumerQueueName,
  createIdempotentProcessor,
  wireDeadLetterQueue,
  type Db,
  type EventBus,
  type OutboxRelay,
} from "@wadar/platform";
import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import pino from "pino";
import { AppModule } from "./app.module.js";
import { registerDummyConsumer, DUMMY_CONSUMER_NAME } from "./consumers/dummy.consumer.js";
import { loadWorkerEnv } from "./env.js";

const env = loadWorkerEnv();
const logger = pino({ name: "wadar-worker" });

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter(),
  );

  const db = app.get<Db>(PLATFORM_DB);
  const redis = app.get<Redis>(PLATFORM_REDIS);
  const eventBus = app.get<EventBus>(PLATFORM_EVENT_BUS);
  const relay = app.get<OutboxRelay>(PLATFORM_OUTBOX_RELAY);

  registerDummyConsumer(eventBus, logger);

  const worker = new Worker(
    consumerQueueName(DUMMY_CONSUMER_NAME),
    createIdempotentProcessor(DUMMY_CONSUMER_NAME, eventBus, db),
    { connection: redis },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "dummy-consumer job failed");
  });

  wireDeadLetterQueue(DUMMY_CONSUMER_NAME, redis);

  relay.start();
  logger.info("outbox relay started");

  await app.listen(env.WORKER_HEALTH_PORT, "0.0.0.0");
  logger.info({ port: env.WORKER_HEALTH_PORT }, "wadar-worker health endpoint listening");

  process.on("SIGTERM", () => {
    void (async () => {
      await relay.stop();
      await worker.close();
      await app.close();
    })();
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, "wadar-worker failed to start");
  process.exitCode = 1;
});
