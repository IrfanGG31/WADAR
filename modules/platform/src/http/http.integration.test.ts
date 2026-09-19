import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlatformModule } from "../platform.module.js";

/**
 * Same caveat as outbox.integration.test.ts: needs Docker, which the sandbox
 * that authored this could not use (Docker Hub blocked by egress policy).
 * Verify in CI before trusting it.
 */
const execFileAsync = promisify(execFile);
const moduleRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("platform HTTP: health + Idempotency-Key (Testcontainers Postgres+Redis)", () => {
  let pgContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
  const tenantId = "018f2f1e-7b1a-7b1a-8b1a-000000000099";

  beforeAll(async () => {
    pgContainer = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({ POSTGRES_USER: "wadar", POSTGRES_PASSWORD: "wadar", POSTGRES_DB: "wadar" })
      .withExposedPorts(5432)
      .start();
    const databaseUrl = `postgres://wadar:wadar@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/wadar`;

    redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    await execFileAsync(
      "pnpm",
      ["exec", "drizzle-kit", "push", "--config=drizzle.config.ts", "--force"],
      { cwd: moduleRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.forRoot({ databaseUrl, redisUrl })],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  it("GET /health/live always returns 200", async () => {
    const res = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
  });

  it("GET /health/ready returns 200 while DB and Redis are reachable", async () => {
    const res = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: "ok", checks: { db: "ok", redis: "ok" } });
  });

  it("POST /ping without x-tenant-id returns 400", async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/ping",
      headers: { "idempotency-key": "key-missing-tenant" },
      payload: { message: "hi" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /ping without Idempotency-Key returns 400", async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/ping",
      headers: { "x-tenant-id": tenantId },
      payload: { message: "hi" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("repeating the same Idempotency-Key returns the cached response instead of creating a second ping", async () => {
    const headers = { "x-tenant-id": tenantId, "idempotency-key": "key-repeat-1" };
    const payload = { message: "hello idempotency" };

    const first = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/ping",
      headers,
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    const second = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/ping",
      headers,
      payload,
    });
    expect(second.statusCode).toBe(201);
    const secondBody = JSON.parse(second.body);

    expect(secondBody).toEqual(firstBody);
  });

  it("GET /health/ready returns 503 once Redis is stopped", async () => {
    await redisContainer.stop();
    const res = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
  }, 30_000);
});
