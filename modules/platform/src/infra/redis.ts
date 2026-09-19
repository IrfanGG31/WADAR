import { Redis } from "ioredis";

/**
 * ioredis 6.x defaults to RESP3; BullMQ expects RESP2-shaped replies. Forcing
 * `protocol: 2` here avoids the whole RESP3 compatibility question rather than
 * relying on ioredis's newer reply-mapping layer — see docs/BUILD-PLAN.md M0
 * plan, dependency versions table (ioredis row).
 *
 * `maxRetriesPerRequest: null` is required by BullMQ (it does its own retry
 * handling); without it BullMQ throws at startup.
 */
export function createRedisConnection(redisUrl: string): Redis {
  const redis = new Redis(redisUrl, {
    protocol: 2,
    maxRetriesPerRequest: null,
  });
  // ioredis is an EventEmitter — an unhandled "error" event crashes the
  // process. A transient/permanent connection failure must surface as a
  // failed /health/ready check instead, not take the whole app down.
  redis.on("error", () => {});
  return redis;
}
