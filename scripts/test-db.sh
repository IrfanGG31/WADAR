#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (with a Supabase stub)
# and runs supabase/tests/*.sql. Needs Postgres 16 + pgvector on PGHOST/PGPORT.
#   PGHOST=/tmp pnpm test:db
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-wadar_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_local_supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }
done
for f in supabase/tests/[0-9]*.sql; do
  [ "$(basename "$f")" = 00_local_supabase_stub.sql ] && continue
  "${PSQL[@]}" -d "$DB" -t -A -f "$f" | grep -v '^$' || { echo "FAILED: $f"; exit 1; }
done
