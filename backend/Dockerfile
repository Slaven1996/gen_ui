# syntax=docker/dockerfile:1
# Build context is the repository root (see docker-compose.yml) because this is
# a pnpm workspace: the backend depends on @gen-ui/shared and the root lockfile.

FROM node:24-bookworm-slim AS base
# Prisma's engines link against OpenSSL, which the slim image does not ship.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS builder
# prisma.config.ts resolves DATABASE_URL when it loads, and `pnpm install` runs
# `prisma generate` from the backend's postinstall. Nothing connects at build
# time, so a placeholder is enough — the real URL is injected at runtime.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public

COPY . .
# Scripts must run: argon2 builds a native binding, and the postinstall above
# generates the Prisma client.
RUN pnpm install --frozen-lockfile --filter backend...
RUN pnpm --filter @gen-ui/shared build \
 && pnpm --filter backend build

FROM base AS runtime
# node_modules comes across whole: `prisma migrate deploy` and the SQL seed
# runner both need their CLIs when the container starts.
COPY --from=builder /repo /repo

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

COPY backend/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
