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
import { signTestJwt, startTestInfra, TEST_JWT_SECRET, type TestInfra } from "@wadar/test-infra";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant } from "../application/create-tenant.js";
import { IdentityModule } from "../identity.module.js";

/**
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
describe("identity tenant isolation (Postgres+Redis via @wadar/test-infra)", () => {
  let infra: TestInfra;
  let migratePool: Pool;
  let appPool: Pool;
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
    infra = await startTestInfra(["identity"]);
    const { migrateUrl, appUrl, redisUrl } = infra;
    migratePool = new Pool({ connectionString: migrateUrl });
    appPool = new Pool({ connectionString: appUrl });
    migrateDb = drizzle(migratePool) as unknown as Db;
    appDb = drizzle(appPool) as unknown as Db;

    clearWriteIsolationCasesForTesting();
    const moduleRef = await Test.createTestingModule({
      imports: [
        PlatformModule.forRoot({ databaseUrl: appUrl, redisUrl }),
        IdentityModule.forRoot({ supabaseJwt: { mode: "hs256", hs256Secret: TEST_JWT_SECRET } }),
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
    await migratePool?.end();
    await appPool?.end();
    await infra?.stop();
  });

  describe("RLS role separation (docs/adr/002)", () => {
    it("wadar_app WITHOUT set_config throws SQLSTATE 42704, not 0 rows", async () => {
      await expect(
        appDb.execute(sql`select * from identity.outlets where id = ${tenantAOutletId}`),
      ).rejects.toMatchObject({ cause: { code: "42704" } });
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
          payload: testCase.body ?? {},
        });

        expect([403, 404]).toContain(res.statusCode);
      }
    });
  });
});
