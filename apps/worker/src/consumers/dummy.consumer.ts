import type { EventBus } from "@wadar/platform";
import type { Logger } from "pino";

export const DUMMY_CONSUMER_NAME = "dummy-consumer";

/**
 * Registers the handler for M0's dummy "platform.ping.created" event — exists
 * only to prove the outbox -> BullMQ -> idempotent-consumer pipeline works
 * end to end (docs/BUILD-PLAN.md M0 DoD). Real consumers land starting M1.
 */
export function registerDummyConsumer(eventBus: EventBus, logger: Logger): void {
  eventBus.registerHandler("platform.ping.created", DUMMY_CONSUMER_NAME, async (_tx, payload) => {
    logger.info({ payload }, "dummy-consumer: processed platform.ping.created");
  });
}
