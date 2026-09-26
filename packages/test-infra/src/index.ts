import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SignJWT } from "jose";
import pg from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export const TEST_JWT_SECRET = "test-only-secret-at-least-32-characters-long!!";

export async function signTestJwt(userId: string, email = `${userId}@example.com`): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

export interface TestInfra {
  /** `wadar` role — superuser/owner, bypasses RLS. Only for setup/assertions about role separation. */
  migrateUrl: string;
  /** `wadar_app` role — what apps/api + apps/worker use; RLS applies. */
  appUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
}

function withDatabase(url: string, database: string, credentials?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (credentials) {
    const [user, password] = credentials.split(":");
    parsed.username = user ?? "";
    parsed.password = password ?? "";
  }
  return parsed.toString();
}

/**
 * Provisions an isolated Postgres database (every listed module's schema
 * pushed as `wadar`, then `wadar_app` grants + FORCE RLS applied from the
 * real infra/postgres-init SQL) plus Redis for one integration test file.
 *
 * Uses Testcontainers by default (CI). When `WADAR_TEST_PG_ADMIN_URL`
 * (a `wadar` superuser URL on an existing Postgres 16) and
 * `WADAR_TEST_REDIS_URL` are set, it instead creates a throwaway database
 * on that server — for machines where a Docker daemon isn't available.
 */
export async function startTestInfra(modules: string[]): Promise<TestInfra> {
  const cleanups: Array<() => Promise<void>> = [];
  let migrateUrl: string;
  let appUrl: string;

  const adminUrl = process.env.WADAR_TEST_PG_ADMIN_URL;
  if (adminUrl) {
    const database = `wadar_test_${randomBytes(6).toString("hex")}`;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database ${database}`);
    await admin.end();
    migrateUrl = withDatabase(adminUrl, database);
    appUrl = withDatabase(adminUrl, database, "wadar_app:wadar_app");
    cleanups.push(async () => {
      const dropper = new pg.Client({ connectionString: adminUrl });
      await dropper.connect();
      await dropper.query(`drop database if exists ${database} with (force)`);
      await dropper.end();
    });
  } else {
    const container: StartedTestContainer = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({ POSTGRES_USER: "wadar", POSTGRES_PASSWORD: "wadar", POSTGRES_DB: "wadar" })
      .withExposedPorts(5432)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    migrateUrl = `postgres://wadar:wadar@${host}:${port}/wadar`;
    appUrl = `postgres://wadar_app:wadar_app@${host}:${port}/wadar`;
    cleanups.push(async () => {
      await container.stop();
    });
  }

  let redisUrl = process.env.WADAR_TEST_REDIS_URL;
  if (!redisUrl) {
    const redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    cleanups.push(async () => {
      await redis.stop();
    });
  }

  // `migrate`, not `push`: drizzle-kit push (0.31) creates RLS policies with
  // empty USING/WITH CHECK clauses, which rejects every write. Run from the
  // repo root with each module's config — see the root
  // package.json db:* scripts for why drizzle-kit must not run per-module.
  for (const moduleName of ["platform", ...modules.filter((m) => m !== "platform")]) {
    await execFileAsync(
      "pnpm",
      ["exec", "drizzle-kit", "migrate", `--config=modules/${moduleName}/drizzle.config.ts`],
      { cwd: repoRoot, env: { ...process.env, DATABASE_MIGRATE_URL: migrateUrl } },
    );
  }

  const client = new pg.Client({ connectionString: migrateUrl });
  await client.connect();
  await client.query(readFileSync(`${repoRoot}/infra/postgres-init/01-create-app-role.sql`, "utf-8"));
  const database = new URL(migrateUrl).pathname.slice(1);
  await client.query(`grant connect on database ${database} to wadar_app`);
  await client.query(readFileSync(`${repoRoot}/infra/postgres-init/02-grant-and-force-rls.sql`, "utf-8"));
  await client.end();

  return {
    migrateUrl,
    appUrl,
    redisUrl,
    stop: async () => {
      for (const cleanup of cleanups.reverse()) await cleanup();
    },
  };
}
