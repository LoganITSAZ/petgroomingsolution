#!/usr/bin/env bash
# Build a throwaway test database full of demo data.
#
#   npm run db:test:reset            # drops and rebuilds gentlegroomer_test
#   DEMO_CUSTOMERS=300 npm run ...   # a bigger shop
#
# The database is DROPPED first, so never point TEST_DATABASE_URL at anything
# you care about. The dev database is left alone.
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-gentlegroomer_test}"

# Password and host come from the dev connection string, so this works whether
# Postgres is local or the docker compose `db` service.
DEV_URL="${DATABASE_URL:-}"
if [ -z "$DEV_URL" ] && [ -f .env.local ]; then
  DEV_URL=$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
fi
if [ -z "$DEV_URL" ] && [ -f .env ]; then
  DEV_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
fi
[ -n "$DEV_URL" ] || { echo "No DATABASE_URL found in the environment, .env.local or .env." >&2; exit 1; }

# The working database is the source for the admin logins, so signing in to
# the test instance takes the same credentials as the real one.
export SOURCE_DATABASE_URL="$DEV_URL"

# Same first-boot admin identity as the real instance, if .env names one.
for key in ADMIN_EMAIL ADMIN_PASSWORD; do
  if [ -z "${!key:-}" ]; then
    value=$(grep -hm1 "^${key}=" .env.local .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
    if [ -n "$value" ]; then export "$key=$value"; fi
  fi
done

ADMIN_URL="${TEST_ADMIN_URL:-${DEV_URL%/*}/postgres}"
export DATABASE_URL="${TEST_DATABASE_URL:-${DEV_URL%/*}/${DB_NAME}}"

# This DROPS the database. Only a name that says "test" is allowed, so the
# real shop's database can never be the target of a typo.
case "$DB_NAME" in
  *test*|*demo*|*scratch*|*sandbox*) ;;
  *) echo "Refusing: \"$DB_NAME\" does not look like a test database." >&2; exit 1 ;;
esac
case "$DATABASE_URL" in
  *"/${DB_NAME}") ;;
  *) echo "Refusing: TEST_DATABASE_URL does not point at ${DB_NAME}." >&2; exit 1 ;;
esac

# psql is often not installed on the host — the database lives in a container.
if command -v psql >/dev/null; then
  run_psql() { psql "$ADMIN_URL" "$@"; }
elif docker compose ps -q db >/dev/null 2>&1 && [ -n "$(docker compose ps -q db)" ]; then
  run_psql() { docker compose exec -T db psql -U postgres -d postgres "$@"; }
else
  echo "Need either psql on PATH or the compose \`db\` service running." >&2
  exit 1
fi

echo "→ recreating ${DB_NAME}"
run_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)" -c "CREATE DATABASE ${DB_NAME}" >/dev/null

npx prisma migrate deploy
npx tsx prisma/seed.ts
npx tsx prisma/demo.ts

echo
echo "Test database ready: $DATABASE_URL"
echo "Point the app at it with:  DATABASE_URL=\"$DATABASE_URL\" npm run dev"
