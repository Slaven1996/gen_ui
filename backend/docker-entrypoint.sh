#!/bin/sh
set -e

# The runtime image carries no pnpm, so the CLIs are called directly.
cd /repo/backend

echo "› Applying database migrations…"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "› Seeding (idempotent)…"
  # Same runner as `pnpm db:seed`; Node strips the types itself, so the image
  # does not need tsx.
  node prisma/seed.ts
fi

echo "› Starting API…"
exec node dist/main.js
