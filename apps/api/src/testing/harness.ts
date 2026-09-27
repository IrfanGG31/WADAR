import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  PLATFORM_DB,
  PLATFORM_EVENT_BUS,
  clearWriteIsolationCasesForTesting,
  drainOutboxForTesting,
  type Db,
  type EventBus,
  type InjectFn,
} from "@wadar/platform";
import { signTestJwt, startTestInfra, TEST_JWT_SECRET, type TestInfra } from "@wadar/test-infra";
import { drizzle } from "drizzle-orm/node-postgres";
import type { InjectOptions } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { AppModule } from "../app.module.js";
import type { ApiEnv } from "../env.js";
import { configureApp } from "../configure-app.js";

export const ALL_MODULES = ["identity", "catalog", "inventory", "sales", "finance", "payments", "insights"];

export interface Actor {
  userId: string;
  token: string;
  tenantId: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  raw: string;
}

export interface Harness {
  app: NestFastifyApplication;
  infra: TestInfra;
  /** `wadar` (owner) connection — bypasses RLS; for assertions only. */
  migrateDb: Db;
  eventBus: EventBus;
  inject: InjectFn;
  ownerA: Actor & { outletId: string };
  cashierA: Actor;
  ownerB: Actor & { outletId: string };
  call: <T = unknown>(
    actor: Actor | undefined,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => Promise<ApiResponse<T>>;
  /** Runs every pending event through the registered consumers (like the worker would). */
  drain: (options?: { deliverTwice?: boolean }) => Promise<number>;
  close: () => Promise<void>;
}

export async function createHarness(
  registerConsumers: (eventBus: EventBus, app: NestFastifyApplication) => void,
  modules: string[] = ALL_MODULES,
): Promise<Harness> {
  const infra = await startTestInfra(modules);
  const migratePool = new Pool({ connectionString: infra.migrateUrl });
  const migrateDb = drizzle(migratePool) as unknown as Db;

  clearWriteIsolationCasesForTesting();
  const env = {
    NODE_ENV: "test",
    DATABASE_URL: infra.appUrl,
    REDIS_URL: infra.redisUrl,
    API_PORT: 0,
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SUPABASE_JWT_MODE: "hs256",
    SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
    PUBLIC_WEB_URL: "http://localhost:3000",
    RECEIPT_SIGNING_SECRET: "test-receipt-secret-at-least-32-characters",
    PAYMENTS_PROVIDER: "simulator",
  } as unknown as ApiEnv;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApp(app, { corsOrigins: ["http://localhost:3000"] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const inject: InjectFn = (opts) => app.getHttpAdapter().getInstance().inject(opts as InjectOptions);

  const eventBus = app.get<EventBus>(PLATFORM_EVENT_BUS);
  registerConsumers(eventBus, app);
  const runtimeDb = app.get<Db>(PLATFORM_DB);

  const call: Harness["call"] = async (actor, method, url, body, headers = {}) => {
    const res = await inject({
      method,
      url,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(actor ? { authorization: `Bearer ${actor.token}`, "x-tenant-id": actor.tenantId } : {}),
        ...(method === "POST" ? { "idempotency-key": randomUUID() } : {}),
        ...headers,
      },
      payload: body === undefined ? undefined : (body as object),
    });
    let parsed: unknown = undefined;
    try {
      parsed = res.body ? JSON.parse(res.body) : undefined;
    } catch {
      parsed = res.body;
    }
    return { status: res.statusCode, body: parsed as never, raw: res.body };
  };

  async function onboard(name: string): Promise<Actor & { outletId: string }> {
    const userId = randomUUID();
    const token = await signTestJwt(userId);
    const res = await call<{ tenantId: string; outletId: string }>(
      { userId, token, tenantId: "" },
      "POST",
      "/v1/tenants",
      { tenantName: name, outletName: `Outlet ${name}`, timezone: "Asia/Jakarta" },
      { "x-tenant-id": "" },
    );
    if (res.status !== 201 && res.status !== 200) throw new Error(`onboarding failed: ${res.status} ${res.raw}`);
    return { userId, token, tenantId: res.body.tenantId, outletId: res.body.outletId };
  }

  const ownerA = await onboard("Toko A");
  const ownerB = await onboard("Toko B");

  const cashierUserId = randomUUID();
  const cashierToken = await signTestJwt(cashierUserId);
  const invite = await call<{ token: string }>(ownerA, "POST", "/v1/invitations", { email: "kasir@a.test", roleKey: "cashier" });
  if (invite.status >= 300) throw new Error(`invite failed: ${invite.raw}`);
  const accept = await call(
    { userId: cashierUserId, token: cashierToken, tenantId: "" },
    "POST",
    `/v1/invitations/${invite.body.token}/accept`,
    undefined,
    { "x-tenant-id": "" },
  );
  if (accept.status >= 300) throw new Error(`accept failed: ${accept.raw}`);
  const cashierA: Actor = { userId: cashierUserId, token: cashierToken, tenantId: ownerA.tenantId };

  return {
    app,
    infra,
    migrateDb,
    eventBus,
    inject,
    ownerA,
    cashierA,
    ownerB,
    call,
    drain: (options) => drainOutboxForTesting(runtimeDb, eventBus, options),
    close: async () => {
      await app.close();
      await migratePool.end();
      await infra.stop();
    },
  };
}
