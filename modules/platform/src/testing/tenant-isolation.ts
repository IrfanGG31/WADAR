import { RequestMethod } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import type { ModulesContainer } from "@nestjs/core";
import { Reflector } from "@nestjs/core";
import { TENANT_SCOPED_METADATA_KEY } from "../http/tenant-scoped.decorator.js";
import type { Tx } from "../infra/outbox.repository.js";

export interface DiscoveredRoute {
  controllerName: string;
  handlerName: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  path: string;
}

function normalizeJoin(controllerPath: string, handlerPath: string): string {
  const a = controllerPath.replace(/^\/|\/$/g, "");
  const b = handlerPath.replace(/^\/|\/$/g, "");
  const joined = [a, b].filter((segment) => segment.length > 0).join("/");
  return `/${joined}`;
}

/**
 * Scans every controller registered in `modulesContainer` for handlers
 * carrying `@TenantScoped()`, and returns their (method, path) — so a
 * module's own integration test can automatically try every GET route
 * against a foreign tenant, with zero manual bookkeeping as routes are
 * added (docs/BUILD-PLAN.md M1 DoD).
 *
 * Reads NestJS's own route metadata directly (`PATH_METADATA`/
 * `METHOD_METADATA`) rather than depending on `@nestjs/swagger` or a
 * discovery package — this is test-only code, and the metadata keys are
 * part of `@nestjs/common`'s stable public constants module.
 *
 * Only discovers routes visible in the `ModulesContainer` passed in — when
 * a module's integration test builds its `TestingModule` from just its own
 * module (+ platform), only that module's own routes are found, which is
 * exactly what keeps this scanner from needing to know about any specific
 * module (CLAUDE.md aturan #1).
 */
export function discoverTenantScopedRoutes(modulesContainer: ModulesContainer): DiscoveredRoute[] {
  const reflector = new Reflector();
  const routes: DiscoveredRoute[] = [];

  for (const module of modulesContainer.values()) {
    for (const wrapper of module.controllers.values()) {
      const controllerClass = wrapper.metatype;
      const instance = wrapper.instance as object | undefined;
      if (!controllerClass || !instance) continue;

      const controllerPathRaw = Reflect.getMetadata(PATH_METADATA, controllerClass) as
        | string
        | string[]
        | undefined;
      const controllerPaths = ([] as string[]).concat(controllerPathRaw ?? "");

      const prototype = Object.getPrototypeOf(instance) as object;
      for (const propertyName of Object.getOwnPropertyNames(prototype)) {
        if (propertyName === "constructor") continue;
        const handler = (prototype as Record<string, unknown>)[propertyName];
        if (typeof handler !== "function") continue;

        const isTenantScoped = reflector.get<boolean | undefined>(
          TENANT_SCOPED_METADATA_KEY,
          handler,
        );
        if (!isTenantScoped) continue;

        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        if (requestMethod === undefined || requestMethod === RequestMethod.ALL) continue;
        const httpMethod = RequestMethod[requestMethod] as DiscoveredRoute["httpMethod"];
        if (httpMethod !== "GET") continue; // write routes go through registerWriteIsolationCase instead

        const handlerPathRaw = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | string[]
          | undefined;
        const handlerPaths = ([] as string[]).concat(handlerPathRaw ?? "");

        for (const controllerPath of controllerPaths) {
          for (const handlerPath of handlerPaths) {
            routes.push({
              controllerName: controllerClass.name,
              handlerName: propertyName,
              httpMethod,
              path: normalizeJoin(controllerPath, handlerPath),
            });
          }
        }
      }
    }
  }

  return routes;
}

export interface InjectResponse {
  statusCode: number;
  body: string;
}

export type InjectFn = (opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
}) => Promise<InjectResponse>;

/**
 * Requests `route` as if it belonged to `foreignTenantId`, and fails the
 * test unless the response is 403/404 (route refused to answer) or its
 * body contains none of `secretsThatMustNotLeak` (route answered, but with
 * no data belonging to the tenant that isn't allowed to see it).
 *
 * A plain substring check on the serialized body is deliberately simple —
 * good enough to catch a forgotten `withTenantContext`/RLS gap (the actual
 * bug class this guards against), without needing every route's response
 * shape wired in generically.
 */
export async function assertRouteIsolated(
  inject: InjectFn,
  route: DiscoveredRoute,
  opts: { foreignTenantId: string; foreignAuthHeaders?: Record<string, string>; secretsThatMustNotLeak: string[] },
): Promise<void> {
  const res = await inject({
    method: route.httpMethod,
    url: route.path,
    headers: { "x-tenant-id": opts.foreignTenantId, ...opts.foreignAuthHeaders },
  });

  if (res.statusCode === 403 || res.statusCode === 404) return;

  for (const secret of opts.secretsThatMustNotLeak) {
    if (res.body.includes(secret)) {
      throw new Error(
        `Tenant isolation violated: ${route.httpMethod} ${route.path} returned status ` +
          `${res.statusCode} and leaked "${secret}" to tenant ${opts.foreignTenantId}.`,
      );
    }
  }
}

export interface WriteIsolationCase {
  /** Name of the module registering this case — for readable failure messages only. */
  module: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route path; may reference `:id`-shaped params the caller fills in after calling createFixture. */
  path: (fixtureId: string) => string;
  /**
   * Creates a resource owned by `tenantAId` inside the given transaction
   * (already wrapped by `withTenantContext`) and returns its id, so the
   * runner can then try to write to it as a different tenant.
   */
  createFixture: (tx: Tx, tenantAId: string) => Promise<{ id: string }>;
}

const writeIsolationRegistry: WriteIsolationCase[] = [];

/**
 * Registers a write-route (POST/PUT/PATCH/DELETE) tenant-isolation case.
 * Write routes need a real, valid resource ID to attempt to mutate — that
 * can't be generated generically the way GET routes are auto-discovered,
 * so each module calls this once per tenant-scoped write route it adds.
 * The one shared runner (see each module's own
 * `tenant-isolation.integration.test.ts`) loops every case registered by
 * the time it runs.
 */
export function registerWriteIsolationCase(testCase: WriteIsolationCase): void {
  writeIsolationRegistry.push(testCase);
}

export function getRegisteredWriteIsolationCases(): readonly WriteIsolationCase[] {
  return writeIsolationRegistry;
}

/** Test utility only — resets the registry between test files/runs. */
export function clearWriteIsolationCasesForTesting(): void {
  writeIsolationRegistry.length = 0;
}
