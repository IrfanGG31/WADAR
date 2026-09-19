import { sql } from "drizzle-orm";
import { pgPolicy, type AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Canonical RLS predicate for every tenant-scoped table (CLAUDE.md aturan #2,
 * docs/ARCHITECTURE.md §5.1) — one implementation reused by every module's
 * `db/schema.ts`, so the policy text never drifts between modules.
 *
 * Deliberately no `missing_ok` fallback: `current_setting('app.tenant_id')`
 * throws (SQLSTATE 42704) if `withTenantContext()` was never called for this
 * transaction, instead of silently evaluating to 0 rows that look identical
 * to "this tenant really has no data" — see
 * docs/adr/002-postgres-role-separation-for-rls.md.
 *
 * `to` is deliberately omitted (defaults to PUBLIC, i.e. every non-superuser
 * role) rather than hardcoding the `wadar_app` role name here — this file
 * has no business knowing which Postgres role runtime traffic uses.
 *
 * Only restricts the table's rows — does NOT enable or force RLS on it.
 * Callers must still chain `.enableRLS()` on the table, and
 * `infra/postgres-init/02-grant-and-force-rls.sql` (`pnpm db:grant`) applies
 * `FORCE ROW LEVEL SECURITY` generically after migrations.
 */
export function tenantRlsPolicy(tenantIdColumn: AnyPgColumn) {
  const predicate = sql`${tenantIdColumn} = current_setting('app.tenant_id')::uuid`;
  return pgPolicy("tenant_isolation", {
    for: "all",
    using: predicate,
    withCheck: predicate,
  });
}
