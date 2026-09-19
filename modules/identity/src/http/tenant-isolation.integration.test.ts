import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { ModulesContainer } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import {
  assertRouteIsolated,
  clearWriteIsolationCasesForTesting,
  discoverTenantScopedRoutes,
  getRegisteredWriteIsolationCases,
  PLATFORM_DB,
  PlatformModule,
  withTenantContext,
  type Db,
  type InjectFn,
} from "@wadar/platform";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant } from "../application/create-tenant.js";
import { IdentityModule } from "../identity.module.js";

/**
 * Same caveat as modules/platform's own integration tests: needs Docker,
 * which the sandbox that authored this could not use (Docker Hub pulls
 * blocked by egress policy). Verify in CI/dev machine before trusting it.
 *
 * Proves the 3 things the M1 plan calls out explicitly:
 * 1. `wadar_app` (runtime role) WITHOUT `set_config` throws (SQLSTATE
 *    42704) — never silently returns 0 rows.
 * 2. `wadar_app` WITH `set_config` to tenant B cannot read tenant A's data
 *    — RLS itself enforces it, tested via a raw query that bypasses the
 *    command layer entirely.
 * 3. `wadar` (migrate/owner role) WITHOUT `set_config` sees everything —
 *    proof the role separation (docs/adr/002) is real, not assumed.
 *
 * Then runs the generic tenant-isolation generator (GET routes via
 * `@TenantScoped()` discovery) and the registered write-isolation cases
 * against identity's own routes — see modules/platform/src/testing/tenant-isolation.ts.
 */
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const HS256_SECRET = "test-only-secret-at-least-32-characters-long!!";

async function signTestJwt(userId: string, email: string): Promise<string> {
  const key = new TextEncoder().encode(HS256_SECRET);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

describe("identity tenant isolation (Testcontainers Postgres+Redis)", () => {
  let pgContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
  let migrateDb: Db; // connected as `wadar` (superuser/owner) — bypasses RLS by design
  let appDb: Db; // connected as `wadar_app` (non-superuser, RLS applies) — same role the running app uses

  let inject: InjectFn;
  let ownerAId: string;
  let ownerBId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let tenantAId: string;
  let tenantBId: string;
  let tenantAOutletId: string;

  beforeAll(async () => {
    pgContainer = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({ POSTGRES_USER: "wadar", POSTGRES_PASSWORD: "wadar", POSTGRES_DB: "wadar" })
      .withExposedPorts(5432)
      .start();
    const host = pgContainer.getHost();
    const port = pgContainer.getMappedPort(5432);
    const migrateUrl = `postgres://wadar:wadar@${host}:${port}/wadar`;
    const appUrl = `postgres://wadar_app:wadar_app@${host}:${port}/wadar`;

    redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    // Migrations run as `wadar` (owner role) for both modules' schemas.
    await execFileAsync(
      "pnpm",
      ["--filter", "@wadar/platform", "exec", "drizzle-kit", "push", "--config=drizzle.config.ts", "--force"],
      { cwd: repoRoot, env: { ...process.env, DATABASE_MIGRATE_URL: migrateUrl } },
    );
    await execFileAsync(
      "pnpm",
      ["--filter", "@wadar/identity", "exec", "drizzle-kit", "push", "--config=drizzle.config.ts", "--force"],
      { cwd: repoRoot, env: { ...process.env, DATABASE_MIGRATE_URL: migrateUrl } },
    );

    // Provision wadar_app + grants + FORCE RLS exactly like `pnpm db:grant`
    // does locally — reads the real SQL files, doesn't duplicate their logic.
    const migratePool = new Pool({ connectionString: migrateUrl });
    const rawMigrateDb = drizzle(migratePool);
    const initSql1 = readFileSync(`${repoRoot}/infra/postgres-init/01-create-app-role.sql`, "utf-8");
    const initSql2 = readFileSync(`${repoRoot}/infra/postgres-init/02-grant-and-force-rls.sql`, "utf-8");
    await rawMigrateDb.execute(sql.raw(initSql1));
    await rawMigrateDb.execute(sql.raw(initSql2));

    migrateDb = rawMigrateDb as unknown as Db;
    const appPool = new Pool({ connectionString: appUrl });
    appDb = drizzle(appPool) as unknown as Db;

    clearWriteIsolationCasesForTesting();
    const moduleRef = await Test.createTestingModule({
      imports: [
        PlatformModule.forRoot({ databaseUrl: appUrl, redisUrl }),
        IdentityModule.forRoot({ supabaseJwt: { mode: "hs256", hs256Secret: HS256_SECRET } }),
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    inject = (opts) => app.getHttpAdapter().getInstance().inject(opts as InjectOptions);

    ownerAId = "018f2f1e-0000-7000-8000-00000000000a";
    ownerBId = "018f2f1e-0000-7000-8000-00000000000b";
    ownerAToken = await signTestJwt(ownerAId, "ownerA@example.com");
    ownerBToken = await signTestJwt(ownerBId, "ownerB@example.com");

    const runtimeDb = app.get<Db>(PLATFORM_DB);
    const tenantA = await createTenant(runtimeDb, {
      ownerUserId: ownerAId,
      tenantName: "Toko A",
      timezone: "Asia/Jakarta",
      outletName: "Outlet A",
      correlationId: "test-setup-a",
    });
    const tenantB = await createTenant(runtimeDb, {
      ownerUserId: ownerBId,
      tenantName: "Toko B",
      timezone: "Asia/Jakarta",
      outletName: "Outlet B",
      correlationId: "test-setup-b",
    });
    tenantAId = tenantA.tenantId;
    tenantBId = tenantB.tenantId;
    tenantAOutletId = tenantA.outletId;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  describe("RLS role separation (docs/adr/002)", () => {
    it("wadar_app WITHOUT set_config throws SQLSTATE 42704, not 0 rows", async () => {
      await expect(
        appDb.execute(sql`select * from identity.outlets where id = ${tenantAOutletId}`),
      ).rejects.toMatchObject({ code: "42704" });
    });

    it("wadar_app WITH set_config to tenant B cannot see tenant A's outlet", async () => {
      const rows = await withTenantContext(appDb, tenantBId, (tx) =>
        tx.execute(sql`select * from identity.outlets where id = ${tenantAOutletId}`),
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("wadar_app WITH set_config to tenant A CAN see tenant A's outlet", async () => {
      const rows = await withTenantContext(appDb, tenantAId, (tx) =>
        tx.execute(sql`select * from identity.outlets where id = ${tenantAOutletId}`),
      );
      expect(rows.rows).toHaveLength(1);
    });

    it("wadar (migrate/owner role) WITHOUT set_config sees rows from every tenant (role separation is real)", async () => {
      const rows = await migrateDb.execute(sql`select tenant_id from identity.outlets`);
      const seenTenantIds = new Set(rows.rows.map((row) => (row as { tenant_id: string }).tenant_id));
      expect(seenTenantIds.has(tenantAId)).toBe(true);
      expect(seenTenantIds.has(tenantBId)).toBe(true);
    });
  });

  describe("tenant-isolation generator — GET routes (@TenantScoped())", () => {
    it("positive control: tenant A's own owner CAN read tenant A's own data", async () => {
      // Proves the isolation checks below are meaningful — if the whole
      // auth/guard chain were broken (e.g. always 403ing), every "tenant B
      // can't see this" assertion would trivially pass for the wrong reason.
      const res = await inject({
        method: "GET",
        url: "/v1/tenants/current",
        headers: { authorization: `Bearer ${ownerAToken}`, "x-tenant-id": tenantAId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Toko A");
    });

    it("no GET route lets tenant B read tenant A's data", async () => {
      const modulesContainer = app.get(ModulesContainer);
      const routes = discoverTenantScopedRoutes(modulesContainer);
      expect(routes.length).toBeGreaterThan(0); // sanity: the generator actually found something

      for (const route of routes) {
        await assertRouteIsolated(inject, route, {
          foreignTenantId: tenantBId,
          foreignAuthHeaders: { authorization: `Bearer ${ownerBToken}` },
          secretsThatMustNotLeak: ["Toko A", "Outlet A", tenantAOutletId],
        });
      }
    });
  });

  describe("tenant-isolation generator — registered write cases", () => {
    it("no registered write route lets tenant B mutate tenant A's resource", async () => {
      const cases = getRegisteredWriteIsolationCases();
      expect(cases.length).toBeGreaterThan(0); // sanity: identity registered its own case

      for (const testCase of cases) {
        const fixture = await withTenantContext(appDb, tenantAId, (tx) => testCase.createFixture(tx, tenantAId));

        const res = await inject({
          method: testCase.method,
          url: testCase.path(fixture.id),
          headers: {
            authorization: `Bearer ${ownerBToken}`,
            "x-tenant-id": tenantBId,
            "content-type": "application/json",
          },
          payload: { roleKey: "manager" },
        });

        expect([403, 404]).toContain(res.statusCode);
      }
    });
  });
});
