#!/usr/bin/env bash
# Start the WADAR dev server with the project's OWN env, overriding whatever
# SUPABASE_* / NEXT_PUBLIC_* the shell inherited from ~/.hermes/.env.
set -euo pipefail
cd /home/ubuntu/WADAR
export PATH="$HOME/.local/bin:$PATH"

# Read the two public vars straight out of .env.local (single source of truth).
WADAR_URL="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2-)"
WADAR_ANON="$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | head -1 | cut -d= -f2-)"

export NEXT_PUBLIC_SUPABASE_URL="$WADAR_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$WADAR_ANON"
# The service role key in this shell belongs to another project — never let it through.
unset SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

exec pnpm dev --port "${PORT:-3001}" --hostname 0.0.0.0
