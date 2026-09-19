import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: Pool } {
  const pool = new Pool({
    connectionString: databaseUrl,
    // Without this, `pg` waits on the OS-level TCP timeout (30s+) before
    // giving up on an unreachable host — found by timing /health/ready
    // against a dead DB and seeing it hang past 10s. Health checks need to
    // fail fast so orchestrators (Railway, k8s) don't misjudge liveness.
    connectionTimeoutMillis: 3_000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
