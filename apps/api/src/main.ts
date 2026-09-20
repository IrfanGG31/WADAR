import "reflect-metadata";
// NOTE: OpenTelemetry's auto-instrumentation patches modules via require hooks.
// Under ESM, `import` statements elsewhere in this file are hoisted and may
// already be resolved before this call runs, so some early-loaded modules can
// end up unpatched. Production-quality setup would use `node --import
// ./dist/instrumentation.js` instead — deferred; M0 only needs the exporter
// wired, not perfect coverage (see modules/platform/README.md "deliberately
// deferred").
import { startInstrumentation } from "./instrumentation.js";
startInstrumentation();

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { correlationIdHook } from "@wadar/platform";
import * as Sentry from "@sentry/node";
import pino from "pino";
import { AppModule } from "./app.module.js";
import { loadApiEnv } from "./env.js";
import { Rfc7807Filter } from "./filters/rfc7807.filter.js";

const env = loadApiEnv();
const logger = pino({ name: "wadar-api" });

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter(),
  );

  app.getHttpAdapter().getInstance().addHook("onRequest", correlationIdHook);
  app.useGlobalFilters(new Rfc7807Filter());
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "x-tenant-id", "x-correlation-id", "idempotency-key"],
  });

  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info({ port: env.API_PORT }, "wadar-api listening");
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, "wadar-api failed to start");
  process.exitCode = 1;
});
