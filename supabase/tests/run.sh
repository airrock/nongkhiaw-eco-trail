#!/bin/bash
# Runs the migrations and tests.sql on a throwaway local Postgres that imitates Supabase's roles and auth.uid().
# Needs initdb / pg_ctl / psql (Postgres 15+) on PATH. Nothing here touches the real project.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="$(mktemp -d)"; port=54329
trap 'pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
initdb -D "$dir/data" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/data" -o "-p $port -c listen_addresses='' -k $dir" -l "$dir/log" -w start >/dev/null
run() { psql -X -q -v ON_ERROR_STOP=1 -h "$dir" -p "$port" -U postgres -d postgres "$@"; }
run -f "$here/supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do run -f "$f"; done
run -o /dev/null -f "$here/tests.sql"
echo "all tests passed"
