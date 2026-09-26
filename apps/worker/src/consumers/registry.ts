import type { INestApplicationContext } from "@nestjs/common";
import { registerFinanceConsumers } from "@wadar/finance";
import { registerInventoryConsumers } from "@wadar/inventory";
import { registerNotificationConsumers } from "@wadar/notification";
import { createPaymentProvider, paymentsOptionsFromEnv, registerPaymentsJobs } from "@wadar/payments";
import { PLATFORM_REALTIME, type EventBus, type RealtimeBroker, type ScheduledJobRegistry } from "@wadar/platform";
import { registerSalesConsumers } from "@wadar/sales";
import type { Logger } from "pino";
import type { WorkerEnv } from "../env.js";
import { registerDummyConsumer } from "./dummy.consumer.js";

/** The worker is the composition root for event consumers (apps/* wire modules, ARCHITECTURE §13). */
export function registerAllConsumers(app: INestApplicationContext, eventBus: EventBus, logger: Logger): void {
  registerDummyConsumer(eventBus, logger);
  registerInventoryConsumers(eventBus);
  registerSalesConsumers(eventBus);
  registerFinanceConsumers(eventBus);
  registerNotificationConsumers(eventBus, app.get<RealtimeBroker>(PLATFORM_REALTIME));
}

export function registerAllScheduledJobs(
  _app: INestApplicationContext,
  scheduler: ScheduledJobRegistry,
  env: WorkerEnv,
): void {
  registerPaymentsJobs(scheduler, createPaymentProvider(paymentsOptionsFromEnv(env)));
}
