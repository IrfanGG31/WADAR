-- NOT meant to do anything useful the FIRST time it runs (as part of
-- docker-entrypoint-initdb.d, before any migration has created a schema or
-- table — both loops below simply iterate zero rows then). Its real job is
-- to be re-run manually after every migration via `pnpm db:grant`
-- (scripts/dev-up.sh already does this) — see
-- docs/adr/002-postgres-role-separation-for-rls.md.
--
-- Deliberately schema-name-agnostic (no hardcoded "platform"/"identity"
-- list): every module owns its own Postgres schema (CLAUDE.md aturan #1),
-- and a schema list here would need editing every time a module is added.
-- Instead this grants `wadar_app` access to whatever schemas exist,
-- excluding Postgres/Supabase-internal ones.
DO $$
DECLARE
  target_schema text;
BEGIN
  FOR target_schema IN
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public')
      AND nspname NOT LIKE 'pg\_%'
      AND nspname NOT LIKE 'auth%'
      AND nspname NOT LIKE 'storage%'
      AND nspname NOT LIKE 'realtime%'
      AND nspname NOT LIKE 'supabase%'
      AND nspname NOT LIKE 'graphql%'
      AND nspname NOT LIKE 'extensions%'
      AND nspname NOT LIKE 'vault%'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO wadar_app', target_schema);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO wadar_app',
      target_schema
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO wadar_app',
      target_schema
    );
    -- Covers tables/sequences a FUTURE migration creates in this schema
    -- (still run as `wadar`), so this script doesn't need to be re-run
    -- after every single migration to keep grants correct — though
    -- `db:grant` running it anyway (idempotent) is the safety net.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE wadar IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wadar_app',
      target_schema
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE wadar IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO wadar_app',
      target_schema
    );
  END LOOP;
END
$$;

-- Defense-in-depth second layer (docs/ARCHITECTURE.md §5.1): `ENABLE ROW
-- LEVEL SECURITY` (set via Drizzle's `.enableRLS()` in each module's
-- db/schema.ts) still lets the TABLE OWNER bypass its own policies unless
-- `FORCE` is also set. `wadar` (migrate role) owns every table, so without
-- this, a bug that ever connects as `wadar` at runtime would silently skip
-- RLS. Drizzle ORM has no schema-builder API for FORCE as of the version
-- pinned in this repo, so it's applied here instead — generically, to
-- every table that already has RLS enabled, not a hardcoded list.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relrowsecurity = true AND c.relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.nspname, r.relname);
  END LOOP;
END
$$;
