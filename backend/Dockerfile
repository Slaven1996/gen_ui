# syntax=docker/dockerfile:1
# Build context is the repository root (see docker-compose.yml) because this is
# a pnpm workspace: the backend depends on @gen-ui/shared and the root lockfile.
#
# Layer strategy: dependencies are installed from the manifests alone, so editing
# source reuses the cached install instead of writing a fresh node_modules layer
# on every build. The pnpm store lives in a BuildKit cache mount — one copy,
# shared by every install below and by later builds.

FROM node:24-bookworm-slim AS base
# Prisma's schema engine (used by `migrate deploy`) links against OpenSSL, which
# the slim image does not ship.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS manifests
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
# prisma.config.ts resolves DATABASE_URL when it loads, and `pnpm install` runs
# `prisma generate` from the backend's postinstall. Nothing connects at build
# time, so a placeholder is enough — the real URL is injected at runtime.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/prisma.config.ts backend/
COPY backend/prisma/schema.prisma backend/prisma/

# Everything needed to compile. Scripts must run: argon2 builds a native
# binding, and the postinstall above generates the Prisma client.
FROM manifests AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter backend...

# Only what the running container needs (no Nest CLI, TypeScript, Vitest, oxlint…).
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter backend...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY backend backend
RUN pnpm --filter @gen-ui/shared build \
 && pnpm --filter backend build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /repo /repo
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/backend/dist backend/dist
# Migrations and the SQL seed files, read at container start.
COPY backend/prisma backend/prisma

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

COPY backend/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
