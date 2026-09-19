import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { sql } from "drizzle-orm";
import type { Db } from "../infra/db.js";
import { PLATFORM_DB, PLATFORM_REDIS } from "./tokens.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    @Inject(PLATFORM_REDIS) private readonly redis: Redis,
  ) {}

  /** Proses hidup — always 200 if the process can answer at all. */
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  /** DB + Redis reachable — 503 if either is down (docs/BUILD-PLAN.md M0 DoD). */
  @Get("ready")
  async ready(): Promise<{ status: string; checks: Record<string, "ok" | "down"> }> {
    const checks: Record<string, "ok" | "down"> = { db: "down", redis: "down" };

    try {
      await this.db.execute(sql`select 1`);
      checks.db = "ok";
    } catch {
      // left as "down"
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "down";
    } catch {
      // left as "down"
    }

    const allOk = Object.values(checks).every((v) => v === "ok");
    if (!allOk) {
      throw new ServiceUnavailableException({
        type: "about:blank",
        title: "Not ready",
        status: 503,
        detail: "One or more dependencies are unreachable.",
        code: "NOT_READY",
        checks,
      });
    }

    return { status: "ok", checks };
  }
}
