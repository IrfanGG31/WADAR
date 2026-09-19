import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { sql } from "drizzle-orm";
import type { Db } from "../infra/db.js";
import { PLATFORM_DB, PLATFORM_REDIS } from "./tokens.js";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

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

  /**
   * DB + Redis reachable — 503 if either is down (docs/BUILD-PLAN.md M0 DoD).
   * Both checks run in parallel with their own bounded timeout: found by
   * timing this endpoint against a dead DB and watching it hang past 10s
   * (pg has no connect timeout by default, and the shared ioredis client
   * can't have one either — `maxRetriesPerRequest: null` is required by
   * BullMQ, so a `.ping()` on it would otherwise wait indefinitely too).
   * Orchestrators (Railway, k8s) expect a fast, bounded answer from a
   * readiness probe, not "eventually 503".
   */
  @Get("ready")
  async ready(): Promise<{ status: string; checks: Record<string, "ok" | "down"> }> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.db.execute(sql`select 1`),
      withTimeout(this.redis.ping(), 3_000),
    ]);

    const checks: Record<string, "ok" | "down"> = {
      db: dbResult.status === "fulfilled" ? "ok" : "down",
      redis: redisResult.status === "fulfilled" && redisResult.value === "PONG" ? "ok" : "down",
    };

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
