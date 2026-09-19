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
export { withTenantContext } from "./application/tenant-context.js";
export { consumerQueueName, dlqQueueName, wireDeadLetterQueue } from "./infra/queues.js";
export {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REDIS,
} from "./http/tokens.js";
export { ZodValidationPipe } from "./http/zod-validation.pipe.js";
export { IdempotencyKeyInterceptor } from "./http/idempotency-key.interceptor.js";
export { TENANT_SCOPED_METADATA_KEY, TenantScoped } from "./http/tenant-scoped.decorator.js";
export { tenantRlsPolicy } from "./db/rls.js";
export { insertAuditLog, type AuditLogEntry } from "./infra/audit-log.repository.js";
export { insertOutboxPending, type NewOutboxRow } from "./infra/outbox.repository.js";
export type { Db } from "./infra/db.js";
export type { Tx } from "./infra/outbox.repository.js";
export {
  discoverTenantScopedRoutes,
  assertRouteIsolated,
  registerWriteIsolationCase,
  getRegisteredWriteIsolationCases,
  clearWriteIsolationCasesForTesting,
  type DiscoveredRoute,
  type InjectFn,
  type InjectResponse,
  type WriteIsolationCase,
} from "./testing/tenant-isolation.js";
