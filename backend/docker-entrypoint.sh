#!/bin/sh
set -e

# The runtime image carries no pnpm, so the CLIs are called directly.
cd /repo/backend

# No schema step: the Postgres container creates every table from
# backend/prisma/init.sql when its volume is first initialised, and compose
# starts this container only once that database is healthy.

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "› Seeding (idempotent)…"
  # Same runner as `pnpm db:seed`; Node strips the types itself, so the image
  # does not need tsx.
  node prisma/seed.ts
fi

echo "› Starting API…"
exec node dist/main.js
