# Gen UI

A dashboard app that combines classic CRUD screens with **Generative UI**: an AI assistant whose answers can include real React components (stat cards, charts, tables) streamed into the page.

| Layer | Stack |
|---|---|
| Frontend (`/frontend`) | React 19, Vite 8 (client-side rendering), TanStack Router (file-based) + Query + Table, shadcn/ui (Radix, Tailwind v4), axios |
| Backend (`/backend`) | NestJS 12 (ESM), Prisma 7 + PostgreSQL 17, Passport JWT, Vercel AI SDK 7 (`@ai-sdk/anthropic`) |
| Shared (`/packages/shared`) | Zod schemas and types used by both sides: DTOs and the Generative UI tool contracts |

## Getting started

Prerequisites: Node 24 (`.nvmrc`), pnpm 10 (`corepack enable pnpm`), Docker.

```bash
pnpm install                      # installs all workspaces and generates the Prisma client
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# In backend/.env set JWT_ACCESS_SECRET (openssl rand -base64 48),
# SEED_ADMIN_PASSWORD, and ANTHROPIC_API_KEY (optional until you use the assistant)

pnpm db:up                        # Postgres in Docker on localhost:5434
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # create the first ADMIN from SEED_ADMIN_*
pnpm dev                          # API on :3000, web app on http://localhost:5173
```

Postgres runs on host port **5434** so it doesn't clash with a locally installed Postgres on 5432 or 5433.

Without an AI key the app works normally, but `POST /api/ai/chat` answers 503 and the assistant shows how to fix it.

## Scripts (root)

| Script | What it does |
|---|---|
| `pnpm dev` | Builds `shared`, then runs shared (watch), API and web app in parallel |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Across all workspaces |
| `pnpm db:up` / `db:down` | Start / stop the Postgres container |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Prisma migrate dev / seed / Studio |

## Authentication

- **Access token**: a short-lived JWT (15 min by default) returned in the JSON body and kept **only in memory** (`frontend/src/lib/auth/token-store.ts`). It never touches Web Storage.
- **Refresh token**: an opaque random value in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. Only its SHA-256 hash is stored.
- **Rotation and reuse detection**: every refresh replaces the token. Replaying an old one outside a 10 s grace window revokes the whole login's token family (`backend/src/sessions/refresh-token.service.ts`).
- **Silent refresh**: when the page loads, the app first tries `POST /auth/refresh`. The axios interceptor refreshes once and retries on a 401; concurrent requests share one refresh.
- **Multiple tabs**: a Web Lock lets only one tab refresh at a time, and a `BroadcastChannel` shares the new token and logouts with the other tabs.
- **Roles**: every route requires a valid token unless it's marked `@Public()`. `@Roles(['ADMIN'])` restricts access by role. There is no public sign-up; admins manage users at `/users`.

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

## Production notes

- Serve the SPA and `/api` from the **same origin** behind a reverse proxy, set `COOKIE_SECURE=true` and `TRUST_PROXY`, and disable proxy buffering for `/api/ai/chat`.
- For split origins, set `CORS_ORIGIN` (comma-separated) and `VITE_API_BASE_URL`. The cookie stays `SameSite=Strict`, so the frontend and API must be on the same site (e.g. `app.example.com` + `api.example.com`).
- Expired refresh-token rows aren't purged automatically yet. Add a scheduled cleanup job when needed.
