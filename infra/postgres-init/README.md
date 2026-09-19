# infra/postgres-init

Scripts mounted read-only into the Postgres container at
`/docker-entrypoint-initdb.d/`. The official Postgres image only runs
these **once**, when the data volume is first created — never again on an
existing volume.

- `01-create-app-role.sql` — creates the `wadar_app` runtime role
  (non-superuser, `NOBYPASSRLS`, not a table owner). Safe to re-run
  manually (idempotent `DO` block).
- `02-grant-and-force-rls.sql` — grants `wadar_app` DML on every non-system
  schema and forces RLS on every RLS-enabled table. A no-op the first time
  it runs here (no schemas/tables exist yet at cluster init) — its real job
  is being re-run via `pnpm db:grant` after every migration, which
  `scripts/dev-up.sh` already does automatically.

**If you already have a `wadar_postgres_data` volume from before this file
existed** (e.g. an M0-era checkout), `01-create-app-role.sql` will NOT run
automatically — Postgres only runs init scripts on a fresh volume. Either:

```bash
pnpm dev:down && docker volume rm wadar_wadar_postgres_data   # fresh volume, re-run dev:up
```

or apply both scripts by hand once:

```bash
docker compose -f infra/docker-compose.yml exec -T postgres \
  psql -U wadar -d wadar -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/01-create-app-role.sql
pnpm db:grant
```

See `docs/adr/002-postgres-role-separation-for-rls.md` for why this split
exists.
