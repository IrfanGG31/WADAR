import { sql } from "drizzle-orm";
import type { Db } from "../infra/db.js";
import type { Tx } from "../infra/outbox.repository.js";

/**
 * Wraps `fn` in a transaction with `app.tenant_id` set for its duration —
 * the ONLY correct way to touch a tenant-scoped (RLS-protected) table
 * (CLAUDE.md aturan #2, docs/ARCHITECTURE.md §5.1).
 *
 * `set_config(..., true)` is transaction-local (`is_local=true`): it resets
 * automatically at COMMIT/ROLLBACK, so there's no risk of a tenant ID
 * leaking onto a pooled connection's next, unrelated query — but it also
 * means EVERY tenant-scoped DB operation must run inside a transaction
 * opened this way, not just once per request.
 *
 * Takes platform's own `Db`/`Tx` types (not a generic type parameter):
 * there is exactly one Postgres connection pool for the whole process
 * (`PLATFORM_DB`, created once by `PlatformModule.forRoot()` and exported
 * globally) — every module, including `identity`, injects that same `Db`
 * and uses it with its own table objects (Drizzle's query builder doesn't
 * require a table to be part of the `schema` map passed to `drizzle()` to
 * `.insert()`/`.select()`/`.update()` on it — only `db.query.*` relational
 * sugar needs that). This lets a single transaction cover both a module's
 * own table write and an insert into platform's shared `outbox` table
 * (CLAUDE.md aturan #5), which a separate pool per module could not do.
 *
 * Lives in `modules/platform` (not `modules/identity`) because every module
 * from M1 onward needs it, and platform is the one module every other
 * module already depends on (CLAUDE.md aturan #1) — not identity-specific.
 */
export async function withTenantContext<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
