#!/usr/bin/env bash
# Runs the database rule tests against a THROWAWAY Postgres with PostGIS.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
# It creates (and drops) a database called ayal_test. Never point it at your Supabase project.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a throwaway Postgres+PostGIS server}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DB="ayal_test"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $TEST_DB" -c "create database $TEST_DB"
TEST_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]*(\?|$)#/$TEST_DB\1#")"

run() { psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }
run "$DIR/supabase/tests/00_supabase_shim.sql"
for f in "$DIR"/supabase/migrations/*.sql; do run "$f"; done
run "$DIR/supabase/tests/01_helpers.sql"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/tests/10_rules_test.sql"

psql "$DATABASE_URL" -q -c "drop database if exists $TEST_DB"
