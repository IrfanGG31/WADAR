#!/bin/bash
# SessionStart hook (Claude Code on the web): installs JS dependencies so
# `pnpm lint|typecheck|test|build` work, and brings up the local Postgres 16 +
# pgvector used by `pnpm test:db` (socket /tmp:5432, superuser role "wadar").
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# ── JavaScript dependencies ──────────────────────────────────────────────────
pnpm install --prefer-offline

# ── Local Postgres for supabase/migrations + supabase/tests (best effort) ────
PG_BIN=/usr/lib/postgresql/16/bin
PG_DATA=/home/pgdata/main
if [ -x "$PG_BIN/pg_ctl" ] && id postgres >/dev/null 2>&1; then
  if [ ! -f /usr/share/postgresql/16/extension/vector.control ]; then
    (apt-get install -y -q postgresql-16-pgvector >/dev/null 2>&1 ||
      (apt-get update -q >/dev/null 2>&1 && apt-get install -y -q postgresql-16-pgvector >/dev/null 2>&1)) ||
      echo "session-start: pgvector not installed; pnpm test:db will fail" >&2
  fi
  if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    mkdir -p "$(dirname "$PG_DATA")"
    chown postgres:postgres "$(dirname "$PG_DATA")"
    # Superuser "wadar" (what scripts/test-db.sh connects as), trust auth on the local socket.
    su postgres -c "$PG_BIN/initdb -D $PG_DATA -U wadar --auth=trust -E UTF8 >/dev/null"
  fi
  if ! "$PG_BIN/pg_isready" -h /tmp -p 5432 -q; then
    su postgres -c "$PG_BIN/pg_ctl -D $PG_DATA -o '-p 5432 -k /tmp' -l $(dirname "$PG_DATA")/log.txt -w start >/dev/null"
  fi
  # Older clusters may only have "postgres": add "wadar" there.
  if ! psql -X -q -h /tmp -U wadar -d postgres -c "select 1" >/dev/null 2>&1; then
    psql -X -q -h /tmp -U postgres -d postgres -c "create role wadar superuser login" >/dev/null 2>&1 ||
      echo "session-start: could not create role wadar" >&2
  fi
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PGHOST=/tmp' >> "$CLAUDE_ENV_FILE"
    echo 'export PGUSER=wadar' >> "$CLAUDE_ENV_FILE"
  fi
else
  echo "session-start: Postgres 16 not found; pnpm test:db unavailable" >&2
fi
