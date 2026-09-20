# Gen UI

A dashboard app that combines classic CRUD screens with **Generative UI**: an AI assistant whose answers can include real React components (stat cards, charts, tables) streamed into the page.

| Layer | Stack |
|---|---|
| Frontend (`/frontend`) | React 19, Vite 8 (client-side rendering), TanStack Router (file-based) + Query + Table, shadcn/ui (Radix, Tailwind v4), axios |
| Backend (`/backend`) | NestJS 12 (ESM), Prisma 7 + PostgreSQL 17, Passport JWT, Vercel AI SDK 7 (`@ai-sdk/anthropic`) |
| Shared (`/packages/shared`) | Zod schemas and types used by both sides: DTOs and the Generative UI tool contracts |

## Getting started

Two ways to run it. Both serve the web app on **http://localhost:5173**, so run one at a time.

### Everything in Docker

The fastest way to see the app, and the one to use when handing the project to someone else. Only Docker is required — no Node, no pnpm, no configuration.

```bash
docker compose up --build         # or: pnpm docker:up
```

That brings up Postgres, the API and the web app, applies migrations and seeds the demo accounts. When it settles, open <http://localhost:5173> and sign in with any account from [Demo accounts](#demo-accounts).

```bash
pnpm docker:down                  # stop
pnpm docker:clean                 # stop and drop the database volume
```

Every setting in `docker-compose.yml` has a development default, including `JWT_ACCESS_SECRET`. That is what makes a fresh clone run unconfigured — **generate a real secret before deploying anywhere** (see [Production notes](#production-notes)). Override any value by exporting it, or point compose at your own file:

```bash
docker compose --env-file backend/.env up
```

The API port is deliberately not published: the browser reaches it same-origin at `/api` through nginx, which leaves port 3000 free for `pnpm dev`. Uncomment the `ports:` block under `backend` to expose it.

### Local development (hot reload)

Prerequisites: Node 24 (`.nvmrc`), pnpm 10 (`corepack enable pnpm`), Docker for Postgres.

```bash
pnpm install                      # installs all workspaces and generates the Prisma client
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# In backend/.env set JWT_ACCESS_SECRET (openssl rand -base64 48)
# and ANTHROPIC_API_KEY (optional until you use the assistant)

pnpm db:up                        # Postgres in Docker on localhost:5434
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # load backend/prisma/seed/*.sql
pnpm dev                          # API on :3000, web app on http://localhost:5173
```

Postgres runs on host port **5434** so it doesn't clash with a locally installed Postgres on 5432 or 5433.

Without an AI key the app works normally, but `POST /api/ai/chat` answers 503 and the assistant shows how to fix it.

## Demo accounts

Created by the seed. Every one of them signs in with **`Password123!`**.

| Email | Name | Role |
|---|---|---|
| `admin@example.com` | Admin | ADMIN |
| `ava.mitchell@example.com` | Ava Mitchell | ADMIN |
| `noah.bennett@example.com` | Noah Bennett | ADMIN |
| `liam.carter@example.com` | Liam Carter | USER |
| `sofia.reyes@example.com` | Sofia Reyes | USER |

These are local demo credentials. Change them before the app is reachable by anyone else.

## Database

Migrations are plain Prisma migrations in `backend/prisma/migrations`. In Docker they are applied on start; locally, run `pnpm db:migrate`.

Seed **data** lives in `backend/prisma/seed/*.sql` as ordinary SQL. `backend/prisma/seed.ts` is only a runner: it executes every `.sql` file in filename order, each in its own transaction. To seed a new entity, add a file — `002_orders.sql`, `003_invoices.sql` — and write `INSERT`s. Nothing in the runner changes.

Make each file re-runnable (`ON CONFLICT ... DO NOTHING`, or `WHERE NOT EXISTS`): `pnpm db:seed` is expected to be safe to run more than once, and it runs on every container start unless you set `SEED_ON_START=false`.

`id` and `updated_at` have to be set explicitly in SQL (`gen_random_uuid()`, `NOW()`) because Prisma generates those values in the client rather than in the database.

## Scripts (root)

| Script | What it does |
|---|---|
| `pnpm docker:up` / `docker:logs` | Build and start the whole stack in Docker, detached / in the foreground |
| `pnpm docker:down` / `docker:clean` | Stop the stack / stop it and drop the database volume |
| `pnpm dev` | Builds `shared`, then runs shared (watch), API and web app in parallel |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Across all workspaces |
| `pnpm db:up` / `db:down` | Start / stop only the Postgres container |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Prisma migrate dev / seed / Studio |

## Authentication

- **Access token**: a short-lived JWT (15 min by default) returned in the JSON body and kept **only in memory** (`frontend/src/lib/auth/token-store.ts`). It never touches Web Storage.
- **Refresh token**: an opaque random value in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. Only its SHA-256 hash is stored.
- **Rotation and reuse detection**: every refresh replaces the token. Replaying an old one outside a 10 s grace window revokes the whole login's token family (`backend/src/sessions/refresh-token.service.ts`).
- **Silent refresh**: when the page loads, the app first tries `POST /auth/refresh`. The axios interceptor refreshes once and retries on a 401; concurrent requests share one refresh.
- **Multiple tabs**: a Web Lock lets only one tab refresh at a time, and a `BroadcastChannel` shares the new token and logouts with the other tabs.
- **Roles**: every route requires a valid token unless it's marked `@Public()`. `@Roles(['ADMIN'])` restricts access by role. There is no public sign-up; admins manage users at `/users`.

### Your own account

`/profile` (also in the user menu) lets any signed-in user change their display name and password, backed by `/api/profile` (`backend/src/profile`).

Changing a password verifies the current one, then writes the new hash and revokes every refresh token for that account **in one transaction**. The tab that made the change is issued a fresh token pair, so it stays signed in while every other device is signed out.

Email is not editable: it is the sign-in identifier, and changing it safely needs a verification flow this app doesn't have. Admins can't change it either. Role and active status are never self-editable — the profile schemas are strict, so sending those fields is a 400 rather than a silent no-op.

## Generative UI

1. The backend calls `streamText` with Zod-typed tools and pipes an AI SDK UI message stream (SSE) back to the client (`backend/src/ai`).
2. The frontend's `useChat` receives typed tool parts. `features/assistant/genui/registry.tsx` maps each tool name to a component, which renders according to the part's state (`input-streaming` → skeleton or progressive render, `output-available` → the component, `output-error` → an alert).

To add a component:
1. Add its schema to `genUiToolSchemas` in `packages/shared/src/genui/tools.ts`.
2. Implement the tool in `backend/src/ai/tools` and add it to `GenUiToolsFactory`.
3. Register a renderer in `registry.tsx`.

TypeScript fails the build if the backend tools and the shared contract drift apart, or if a tool has no renderer.

The assistant is available as a right-hand panel on every page (Ctrl/Cmd + J) and as a full page at `/assistant`. Both show the same conversation. Pages can describe themselves to the assistant with `useAssistantContext()`.

### Model settings

`AI_MODEL=claude-opus-5` by default (switch to `claude-sonnet-5` in `.env` to lower cost). Thinking is adaptive. Don't add `temperature`/`topP`/`budgetTokens` for these models, because they are rejected with a 400 error. `AI_REFUSAL_FALLBACK=true` enables Anthropic's server-side refusal fallback. `AI_PROVIDER` also accepts `openai`, `google` (install the matching `@ai-sdk/*` package) or `gateway`.

## Operations

**Health checks.** `GET /api/health/live` has no dependencies and answers as long as the process can serve — use it for liveness, so a database blip doesn't get a healthy container restarted. `GET /api/health/ready` pings the database and answers 503 when it is unreachable — use it for readiness and load-balancer membership. `GET /api/health` is kept for existing callers and behaves like `/ready`.

**Errors.** Every error response carries `statusCode`, `message`, `timestamp` and `path`; handlers add their own fields on top (auth errors carry a machine-readable `code`). Unexpected failures are logged with a stack server-side and return a generic message to the client (`backend/src/common/all-exceptions.filter.ts`).

**Refresh-token retention.** Rows are kept after logout and rotation because they are what makes reuse detection work. A daily job (03:00) deletes tokens more than `REFRESH_TOKEN_PRUNE_AFTER_DAYS` (default 30) past expiry, so the table doesn't grow without bound.

## Production notes

- Serve the SPA and `/api` from the **same origin** behind a reverse proxy, set `COOKIE_SECURE=true` and `TRUST_PROXY`, and disable proxy buffering for `/api/ai/chat`. `frontend/nginx.conf` is a working example of all of this.
- Set `NODE_ENV=production`. Configuration is validated at boot and fails fast: in production `COOKIE_SECURE` must be true and the API key for the selected `AI_PROVIDER` must be present.
- Replace the development `JWT_ACCESS_SECRET` from `docker-compose.yml` with a real one (`openssl rand -base64 48`, at least 32 characters).
- For split origins, set `CORS_ORIGIN` (comma-separated) and `VITE_API_BASE_URL`. The cookie stays `SameSite=Strict`, so the frontend and API must be on the same site (e.g. `app.example.com` + `api.example.com`).
- There is **no rate limiting**. This is a student project and 429s were getting in the way; if the app is ever exposed publicly, put a limiter in front of `/api/auth/login` (or restore `@nestjs/throttler`, removed in this branch's history).
- The `users` search filter is an unanchored `ILIKE`. It has no index; add a `pg_trgm` GIN index if that listing gets large.
