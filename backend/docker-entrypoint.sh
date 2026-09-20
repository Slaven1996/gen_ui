#!/bin/sh
set -e

echo "› Applying database migrations…"
pnpm --filter backend db:deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "› Seeding (idempotent)…"
  pnpm --filter backend db:seed
fi

echo "› Starting API…"
exec node backend/dist/main.js
