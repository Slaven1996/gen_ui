# syntax=docker/dockerfile:1
# Build context is the repository root — this is a pnpm workspace.

FROM node:24-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile --filter frontend...
# `tsc -b` in the frontend build resolves @gen-ui/shared from its dist.
RUN pnpm --filter @gen-ui/shared build \
 && pnpm --filter frontend build

FROM nginx:1.29-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
