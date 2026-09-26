import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { startTestInfra, type TestInfra } from "@wadar/test-infra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlatformModule } from "../platform.module.js";

describe("platform HTTP: health + Idempotency-Key (Postgres+Redis via @wadar/test-infra)", () => {
  let infra: TestInfra;
  let app: NestFastifyApplication;
  const tenantId = "018f2f1e-7b1a-7b1a-8b1a-000000000099";

  async function buildApp(databaseUrl: string, redisUrl: string): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.forRoot({ databaseUrl, redisUrl })],
    }).compile();
    const built = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await built.init();
    await built.getHttpAdapter().getInstance().ready();
    return built;
  }

  beforeAll(async () => {
    infra = await startTestInfra([]);
    app = await buildApp(infra.migrateUrl, infra.redisUrl);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
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

  it("GET /health/ready returns 503 when Redis is unreachable", async () => {
    const broken = await buildApp(infra.migrateUrl, "redis://127.0.0.1:1");
    try {
      const res = await broken.getHttpAdapter().getInstance().inject({ method: "GET", url: "/health/ready" });
      expect(res.statusCode).toBe(503);
    } finally {
      await broken.close();
    }
  }, 30_000);
});
