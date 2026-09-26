/** NestJS DI token for the shared Drizzle `Db` instance (see platform.module.ts). */
export const PLATFORM_DB = Symbol("PLATFORM_DB");

/** NestJS DI token for the shared in-process EventBus instance. */
export const PLATFORM_EVENT_BUS = Symbol("PLATFORM_EVENT_BUS");

/** NestJS DI token for the shared ioredis connection (health checks, BullMQ). */
export const PLATFORM_REDIS = Symbol("PLATFORM_REDIS");

/**
 * NestJS DI token for the OutboxRelay instance. Only apps/worker calls
 * `.start()` on it — apps/api gets the same provider but never starts it, so
 * the relay never runs twice (docs/ARCHITECTURE.md: relay lives in the worker).
 */
export const PLATFORM_OUTBOX_RELAY = Symbol("PLATFORM_OUTBOX_RELAY");

/** NestJS DI token for the RealtimeBroker (per-tenant Redis pub/sub → SSE). */
export const PLATFORM_REALTIME = Symbol("PLATFORM_REALTIME");

/** NestJS DI token for the ScheduledJobRegistry (periodic jobs run by apps/worker). */
export const PLATFORM_SCHEDULER = Symbol("PLATFORM_SCHEDULER");
