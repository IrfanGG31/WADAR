import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { correlationIdHook } from "@wadar/platform";
import { Rfc7807Filter } from "./filters/rfc7807.filter.js";

/** HTTP setup shared by main.ts and the integration-test harness, so tests exercise the real configuration. */
export function configureApp(app: NestFastifyApplication, options: { corsOrigins: string[] }): void {
  app.getHttpAdapter().getInstance().addHook("onRequest", correlationIdHook);
  app.useGlobalFilters(new Rfc7807Filter());
  app.enableCors({
    origin: options.corsOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "x-tenant-id", "x-correlation-id", "idempotency-key"],
  });
}
