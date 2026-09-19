/**
 * Public API of the `platform` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1). Do not import from `domain/`, `application/`,
 * `infra/`, `http/`, or `db/schema.ts` directly from outside this module.
 */
export { PlatformModule, type PlatformModuleOptions } from "./platform.module.js";
export { EventBus, type EventHandler } from "./application/event-bus.js";
export { OutboxRelay } from "./application/outbox-relay.js";
export { createIdempotentProcessor, type OutboxJobData } from "./application/idempotent-consumer.js";
export { createPing, type CreatePingCommand } from "./application/ping-command.js";
export {
  correlationIdHook,
  correlationIdStorage,
  getCorrelationId,
} from "./application/correlation-id.js";
export { consumerQueueName, dlqQueueName, wireDeadLetterQueue } from "./infra/queues.js";
export {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REDIS,
} from "./http/tokens.js";
export { ZodValidationPipe } from "./http/zod-validation.pipe.js";
export { IdempotencyKeyInterceptor } from "./http/idempotency-key.interceptor.js";
export type { Db } from "./infra/db.js";
