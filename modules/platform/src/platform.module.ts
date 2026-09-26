import { Inject, Injectable, Module, type DynamicModule, type OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import pino from "pino";
import { EventBus } from "./application/event-bus.js";
import { ScheduledJobRegistry } from "./application/scheduled-jobs.js";
import { OutboxRelay } from "./application/outbox-relay.js";
import { createDb } from "./infra/db.js";
import { RealtimeBroker } from "./infra/realtime.js";
import { createRedisConnection } from "./infra/redis.js";
import { HealthController } from "./http/health.controller.js";
import { PingController } from "./http/ping.controller.js";
import {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REALTIME,
  PLATFORM_REDIS,
  PLATFORM_SCHEDULER,
} from "./http/tokens.js";

export interface PlatformModuleOptions {
  databaseUrl: string;
  redisUrl: string;
}

const PLATFORM_POOL = Symbol("PLATFORM_POOL");

@Injectable()
class PlatformLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(PLATFORM_POOL) private readonly pool: Pool,
    @Inject(PLATFORM_REDIS) private readonly redis: Redis,
    @Inject(PLATFORM_REALTIME) private readonly realtime: RealtimeBroker,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.realtime.close();
    await this.pool.end();
    this.redis.disconnect();
  }
}

@Module({})
export class PlatformModule {
  static forRoot(options: PlatformModuleOptions): DynamicModule {
    const { db, pool } = createDb(options.databaseUrl);
    const redis = createRedisConnection(options.redisUrl);
    const eventBus = new EventBus();
    const logger = pino({ name: "platform" });
    // BullMQ accepts an existing ioredis instance directly as `connection`,
    // reusing the same client instead of opening a second connection.
    const relay = new OutboxRelay(db, eventBus, redis, logger);
    const realtime = new RealtimeBroker(redis);
    const scheduler = new ScheduledJobRegistry();

    return {
      module: PlatformModule,
      global: true,
      controllers: [HealthController, PingController],
      providers: [
        { provide: PLATFORM_DB, useValue: db },
        { provide: PLATFORM_REDIS, useValue: redis },
        { provide: PLATFORM_EVENT_BUS, useValue: eventBus },
        { provide: PLATFORM_OUTBOX_RELAY, useValue: relay },
        { provide: PLATFORM_REALTIME, useValue: realtime },
        { provide: PLATFORM_SCHEDULER, useValue: scheduler },
        { provide: PLATFORM_POOL, useValue: pool },
        PlatformLifecycle,
      ],
      exports: [
        PLATFORM_DB,
        PLATFORM_REDIS,
        PLATFORM_EVENT_BUS,
        PLATFORM_OUTBOX_RELAY,
        PLATFORM_REALTIME,
        PLATFORM_SCHEDULER,
      ],
    };
  }
}
