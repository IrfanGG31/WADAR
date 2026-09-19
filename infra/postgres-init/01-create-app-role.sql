-- Runs once via docker-entrypoint-initdb.d on first cluster init (empty
-- volume only — see infra/postgres-init/README.md for what to do on an
-- existing volume).
--
-- Why this file exists: `wadar` (POSTGRES_USER above) is a cluster
-- superuser AND becomes the owner of every table `drizzle-kit`
-- push/migrate creates with it. Postgres lets superusers and table owners
-- bypass Row-Level Security unconditionally, regardless of policy — so if
-- `apps/api`/`apps/worker` connected as `wadar` at runtime, every RLS
-- policy in every module's schema (tenant isolation, CLAUDE.md aturan #2)
-- would silently do nothing. `wadar_app` is a separate, deliberately
-- unprivileged role used ONLY for runtime traffic (DATABASE_URL); `wadar`
-- is now used ONLY for migrations (DATABASE_MIGRATE_URL). See
-- docs/adr/002-postgres-role-separation-for-rls.md.
--
-- Local-dev-only credential, same pattern as POSTGRES_PASSWORD above
-- (plain, committed, never used outside a local/CI Postgres container).
-- A hosted deployment (Supabase or otherwise) must set a real secret via
-- its own secrets manager, never this file (CLAUDE.md aturan #11).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wadar_app') THEN
    CREATE ROLE wadar_app
      LOGIN
      PASSWORD 'wadar_app'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE wadar TO wadar_app;
