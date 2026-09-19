#!/usr/bin/env bash
# One-shot local start: infra -> schema -> apps. See README.md "Menjalankan lokal".
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "==> .env belum ada, menyalin dari .env.example"
  cp .env.example .env
fi

echo "==> Menyalakan Postgres + Redis (infra/docker-compose.yml)"
docker compose -f infra/docker-compose.yml up -d --wait

echo "==> Push schema platform ke Postgres"
pnpm --filter @wadar/platform exec drizzle-kit push --force

echo "==> Menyalakan web (:3000) + api (:3001) + worker (:3002)"
exec pnpm dev
