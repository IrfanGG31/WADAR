import { Module, type DynamicModule } from "@nestjs/common";
import pino from "pino";
import { EventBus } from "./application/event-bus.js";
import { OutboxRelay } from "./application/outbox-relay.js";
import { createDb } from "./infra/db.js";
import { createRedisConnection } from "./infra/redis.js";
import { HealthController } from "./http/health.controller.js";
import { PingController } from "./http/ping.controller.js";
import {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  PLATFORM_OUTBOX_RELAY,
  PLATFORM_REDIS,
} from "./http/tokens.js";

export interface PlatformModuleOptions {
  databaseUrl: string;
  redisUrl: string;
}

@Module({})
export class PlatformModule {
  static forRoot(options: PlatformModuleOptions): DynamicModule {
    const { db } = createDb(options.databaseUrl);
    const redis = createRedisConnection(options.redisUrl);
    const eventBus = new EventBus();
    const logger = pino({ name: "platform" });
    // BullMQ accepts an existing ioredis instance directly as `connection`,
    // reusing the same client instead of opening a second connection.
    const relay = new OutboxRelay(db, eventBus, redis, logger);

    return {
      module: PlatformModule,
      global: true,
      controllers: [HealthController, PingController],
      providers: [
        { provide: PLATFORM_DB, useValue: db },
        { provide: PLATFORM_REDIS, useValue: redis },
        { provide: PLATFORM_EVENT_BUS, useValue: eventBus },
        { provide: PLATFORM_OUTBOX_RELAY, useValue: relay },
      ],
      exports: [PLATFORM_DB, PLATFORM_REDIS, PLATFORM_EVENT_BUS, PLATFORM_OUTBOX_RELAY],
    };
  }
}
