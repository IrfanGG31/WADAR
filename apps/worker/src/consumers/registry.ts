import type { INestApplicationContext } from "@nestjs/common";
import { registerInventoryConsumers } from "@wadar/inventory";
import type { EventBus, ScheduledJobRegistry } from "@wadar/platform";
import type { Logger } from "pino";
import { registerDummyConsumer } from "./dummy.consumer.js";

/** The worker is the composition root for event consumers (apps/* wire modules, ARCHITECTURE §13). */
export function registerAllConsumers(_app: INestApplicationContext, eventBus: EventBus, logger: Logger): void {
  registerDummyConsumer(eventBus, logger);
  registerInventoryConsumers(eventBus);
}

export function registerAllScheduledJobs(_app: INestApplicationContext, _scheduler: ScheduledJobRegistry): void {}
