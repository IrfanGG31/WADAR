#!/usr/bin/env bash
# Quick local monitoring snapshot: api/worker health + infra container status.
# Usage: pnpm dev:health   (run while `pnpm dev` / `pnpm dev:up` is up)
set -uo pipefail
cd "$(dirname "$0")/.."

API_PORT="${API_PORT:-3001}"
WORKER_HEALTH_PORT="${WORKER_HEALTH_PORT:-3002}"

check() {
  local label="$1" url="$2"
  local body status
  body=$(curl -s -w "\n%{http_code}" --max-time 6 "$url" 2>/dev/null)
  status=$(echo "$body" | tail -n1)
  body=$(echo "$body" | sed '$d')
  if [ -z "$status" ] || [ "$status" = "000" ]; then
    printf "  %-28s TIDAK BISA DIHUBUNGI (%s)\n" "$label" "$url"
  else
    printf "  %-28s HTTP %s  %s\n" "$label" "$status" "$body"
  fi
}

echo "== apps =="
check "api  /health/live"    "http://localhost:${API_PORT}/health/live"
check "api  /health/ready"   "http://localhost:${API_PORT}/health/ready"
check "worker /health/live"  "http://localhost:${WORKER_HEALTH_PORT}/health/live"
check "worker /health/ready" "http://localhost:${WORKER_HEALTH_PORT}/health/ready"

echo ""
echo "== infra (docker compose) =="
docker compose -f infra/docker-compose.yml ps 2>/dev/null || echo "  docker compose belum jalan"

echo ""
echo "== web =="
check "web  /" "http://localhost:3000/"
