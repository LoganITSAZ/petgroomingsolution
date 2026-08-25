#!/bin/sh
# Runs once per deploy, before the app container starts.
set -e

echo "→ Applying database migrations"
npx prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "→ Seeding baseline data (idempotent)"
  npx tsx prisma/seed.ts
else
  echo "→ SEED_ON_START=false, skipping seed"
fi

echo "✓ Database ready"
