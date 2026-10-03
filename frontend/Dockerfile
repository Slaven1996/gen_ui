# syntax=docker/dockerfile:1
# Build context is the repository root — this is a pnpm workspace.
#
# Dependencies are installed from the manifests alone, so editing source reuses
# the cached install; the pnpm store lives in a BuildKit cache mount.
#
# Two targets share every layer up to the sources:
# - `runtime` (the default, last stage): the production build behind nginx.
# - `dev`: the Vite dev server for `pnpm docker:dev` (docker-compose.dev.yml),
#   where Compose Watch copies edits into the running container and Vite
#   hot-reloads them, so a source change never rebuilds this image.

FROM node:24-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter frontend...

FROM deps AS sources
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY frontend frontend
# `tsc -b` and Vite both resolve @gen-ui/shared from its dist.
RUN pnpm --filter @gen-ui/shared build

# Like `pnpm dev`: shared recompiles its dist on change, and Vite picks that up.
# Vite listens on 80, the same container port as nginx, so docker-compose.yml's
# port mapping serves either target on http://localhost:5173.
FROM sources AS dev
EXPOSE 80
CMD ["sh", "-c", "pnpm --filter @gen-ui/shared dev & exec pnpm --filter frontend dev --host 0.0.0.0 --port 80 --strictPort"]

FROM sources AS builder
RUN pnpm --filter frontend build

FROM nginx:1.29-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
