# Gen UI

A dashboard app that combines classic CRUD screens with **Generative UI**: an AI assistant whose answers can include the app's own React components (live, paged tables) streamed into the page.

| Layer | Stack |
|---|---|
| Frontend (`/frontend`) | React 19, Vite 8 (client-side rendering), TanStack Router (file-based) + Query + Table, shadcn/ui (Radix, Tailwind v4), axios, Socket.IO client |
| Backend (`/backend`) | NestJS 12 (ESM), Prisma 7 + PostgreSQL 17, Passport JWT, Vercel AI SDK 7 (`@ai-sdk/anthropic`), WebSockets (`@nestjs/websockets` + Socket.IO), OpenAPI via `@nestjs/swagger` |
| Shared (`/packages/shared`) | Zod schemas and types used by both sides: DTOs and the Generative UI tool contracts |

## Getting started

Two ways to run it. Both serve the web app on **http://localhost:5173**, so run one at a time.

### Everything in Docker

The fastest way to see the app, and the one to use when handing the project to someone else. Only Docker is required — no Node, no pnpm, no configuration.

```bash
docker compose up --build         # or: pnpm docker:up
```

That brings up Postgres (which creates the schema from `backend/prisma/init.sql`), the API (which seeds the demo data) and the web app. When it settles, open <http://localhost:5173> and sign in with any account from [Demo accounts](#demo-accounts). The API documents itself at <http://localhost:5173/docs>.

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

pnpm db:up                        # Postgres in Docker on localhost:5434; a new volume gets the schema
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

## The monitoring domain

The app monitors a small water utility (the seed data): a tree of **assets** (regions → sites → areas → equipment), the **devices** installed on them, and the **tags** (datapoints) those devices report. Readings land in **measurements**; **alarm rules** watch tags and raise **alarms**; people keep a **logbook**, work **shifts**, and build their own **dashboards**.

| Page | API | What it is for |
|---|---|---|
| `/dashboard` | `/api/dashboards` | Customizable grid of widgets; own dashboards plus shared ones |
| `/analytics` | `/api/analytics/*` | KPIs, alarms per day by severity, most frequent alarms |
| `/alarms` | `/api/alarms` | The alarm console: filter, acknowledge (one or many), open an alarm's timeline |
| `/alarm-rules` | `/api/alarm-definitions` | Threshold rules on tags (admins edit) |
| `/logbook` | `/api/logbook` | Operator notes, maintenance, shift handovers — and system events |
| `/shifts` | `/api/shifts/*` | Week plan, shift templates, who is on duty now |
| `/assets`, `/assets/:id` | `/api/assets` | The asset tree; an asset page is built from embedded, pre-filtered views |
| `/devices`, `/tags` | `/api/devices`, `/api/tags` | RTUs/PLCs/sensors and their datapoints with live values |
| `/graphs` | `/api/telemetry/series`, `/stats` | Trend explorer: up to 8 tags, server-side buckets, one chart per unit |
| `/audit` | `/api/audit-logs` | Who changed what (admins) |

Admins configure (assets, devices, tags, rules, shift plans); everyone can acknowledge alarms, write in the logbook and build dashboards. The entities, their attributes, operations and associations are drawn as a UML class diagram in [`docs/class-diagram.drawio`](docs/class-diagram.drawio) — open it in [diagrams.net](https://app.diagrams.net) or the VS Code *Draw.io Integration* extension. The tables themselves are in [`backend/prisma/init.sql`](backend/prisma/init.sql).

### Where the code lives

Each module is a folder on both sides. `backend/src/features/<module>` holds its Nest module, controllers and services; `frontend/src/features/<module>` holds its tables, charts and dialogs, and the page that assembles them lives in `frontend/src/routes/_authenticated`. What every module shares stays at the root of `backend/src`: `common` (list-query helpers, decorators, the exception filter), `config`, `docs` and `prisma`.

`@gen-ui/shared` runs from its compiled `dist` (so `pnpm dev` builds it first and then watches it). Editors don't need that build: `frontend/tsconfig.app.json` and `backend/tsconfig.json` list the package as a TypeScript **project reference**, so the editor reads its source, and a new export is visible in both apps the moment it is saved. `tsc -b` (the frontend build) builds the package itself when it is out of date.

### One query, three uses

Every list endpoint takes the same kind of query — `page`/`pageSize`, `sort=field` or `sort=-field`, comma-separated multi-value filters, a time window as `range=24h` (relative, so links stay live) or `from`/`to`, `search`, and `assetId` meaning "this asset and everything below it". Each is **one Zod schema in `@gen-ui/shared`**, used by:

1. the API, to validate `@Query()`;
2. the page, as its route's `validateSearch` — so `/alarms?state=ACTIVE,CLEARED&severity=CRITICAL&range=7d` and `GET /api/alarms?state=ACTIVE,CLEARED&severity=CRITICAL&range=7d` are the same query;
3. the next phase's Generative UI tools, as their input.

Tables and charts (`AlarmsTable`, `TelemetryChart`, `LogbookTable`, `TagsTable`, …) take that query as a prop and fetch their own data. A page feeds them from its URL; an embed (a dashboard widget, an asset page card, later a chat answer) passes a fixed query and adds **View full page** — a plain link to the page with the same query. A dashboard widget's `config` *is* such a query (`WIDGET_CONFIG_SCHEMAS`), and `features/dashboards/widget-registry.tsx` maps each widget type to its view and its full page; a GenUI tool emitting `{ type, config }` can render through that same registry.

### Alarms, end to end

A reading arrives (`POST /api/telemetry/measurements`, or the simulator) → the tag's latest value moves → every enabled rule on the tag is evaluated, with the rule rows locked so concurrent readings can't double-raise → a firing value raises an `ACTIVE` alarm; a value back past the threshold by the **deadband** clears it (`CLEARED`, or `CLOSED` if already acknowledged). Acknowledging moves `ACTIVE → ACKNOWLEDGED` / `CLEARED → CLOSED`. Every transition is written to the logbook (the alarm's timeline is `GET /api/logbook?alarmId=…`), and every user action to the audit log, in the same transaction as the change.

**The simulator** (`SIMULATOR_ENABLED`, default on) writes a reading for every tag of an `ONLINE` device every `SIMULATOR_INTERVAL_SECONDS` through that same ingest path, with an occasional excursion that trips the seeded rules — so charts move and alarms come and go in a demo. Turn it off when real data flows in. Measurements older than `TELEMETRY_RETENTION_DAYS` (180) are pruned daily.

### Real-time notifications

The bell in the header shows alarm notifications the moment the server sends them, over a **WebSocket** — nothing polls. Every signed-in tab opens one Socket.IO connection (namespace `/notifications`, path `/api/socket.io`, WebSocket transport only), so it travels through the Vite proxy and nginx like the rest of `/api`, on the web app's own origin.

- **Server:** `backend/src/features/notifications`. `NotificationsGateway` (`@WebSocketGateway`) checks the access token in the socket handshake exactly as the REST guard does (signature, expiry, active account) and refuses the connection otherwise. A producer calls `NotificationsGateway.broadcast(notification)`; the payload is `AppNotificationSchema` in `packages/shared/src/notifications.ts`.
- **Browser:** `frontend/src/features/notifications`. The app shell opens the socket after sign-in and closes it on sign-out; a reconnect sends a fresh token. The bell counts unread notifications, lists the latest 50 (severity, text, asset link, time), and marks them read when its popover closes. The list lives in the tab's memory.
- **Demo alarms (temporary):** until real alarms are wired in, `MockAlarmNotifier` runs every 20 s and, when `Math.random() > 0.5`, pushes a made-up alarm on a random analog tag (marked *Demo alarm*; nothing is stored). `MOCK_ALARM_NOTIFICATIONS=false` turns it off. To go live, have the alarm evaluator broadcast each alarm it raises, after its transaction commits, and delete the mock.

### Users

`/users` filters by name or email, role, **status** (active / deactivated) and **last sign-in**: *All*, *Never signed in*, or *Exact date* with a date picker. They are URL and API parameters like every other list filter: `GET /api/users?status=DEACTIVATED&lastSignIn=never`, or `lastSignIn=2026-05-03` for a day. That day is read in `timeZone`, which the web app sets to the browser's zone, so the filter matches the date the *Last sign-in* column shows.

## API docs

**Swagger UI** is at <http://localhost:5173/docs>, with the raw document at `/docs/openapi.json`
and `/docs/openapi.yaml`. It is generated from the very Zod schemas the endpoints validate with,
so it cannot drift from the code.

The API serves it, but it is published on the web app's origin, so **Try it out** reaches `/api`
same-origin and the refresh cookie behaves as it does in the app. To call a guarded route: run
`POST /api/auth/login`, copy `accessToken` out of the response, press **Authorize**, paste it.

**Postman**: import `postman/gen-ui.postman_collection.json`. It covers every endpoint with the
demo credentials already filled in. Signing in stores the access token in a collection variable
that every other request sends, and a collection-level script signs in again whenever that
variable is empty — so **Run collection** works top to bottom even though *Sign out* clears the
token halfway. Two requests have real consequences and say so: *Change my password* changes the
seeded account's password for good, and *Ask the assistant* spends provider tokens.

That file is written by hand, for readability. If you would rather have one that is always
current, import `http://localhost:5173/docs/openapi.json` into Postman instead.

Adding an endpoint? The request side documents itself — `@Body({ schema })` and
`@Query({ schema })` are read straight off the route. Write the prose in `@ApiOperation`, give the
response shape with `@ApiOkResponse({ standardSchema })`, and list the failures with
`@ApiErrorResponse(status, why)` from `backend/src/docs/api-error.ts`.

## Database

**The schema is one SQL file, `backend/prisma/init.sql`**: every enum, table, index, foreign key and `CHECK` constraint. There are no migrations. The Postgres container runs the file once, when its data volume is empty (it is mounted into `/docker-entrypoint-initdb.d`), so a fresh `docker compose up` or `pnpm db:up` creates the whole database. Its healthcheck goes over TCP, which Postgres only opens once the file has run, so the API never starts against a half-built database.

`backend/prisma/schema.prisma` describes the same tables for the Prisma client. To change the schema, edit both, run `pnpm --filter backend db:generate`, then rebuild the local database with `pnpm db:reset` (it drops the database volume and starts Postgres again) and `pnpm db:seed`. `pnpm docker:clean` does the same for the whole stack.

Seed **data** lives in `backend/prisma/seed/*.sql` as ordinary SQL. `backend/prisma/seed.ts` is only a runner: it executes every `.sql` file in filename order, each in its own transaction. To seed a new entity, add a file — `002_orders.sql`, `003_invoices.sql` — and write `INSERT`s. Nothing in the runner changes.

Make each file re-runnable (`ON CONFLICT ... DO NOTHING`, or `WHERE NOT EXISTS`): `pnpm db:seed` is expected to be safe to run more than once, and it runs on every container start unless you set `SEED_ON_START=false`.

`id` and `updated_at` have to be set explicitly in SQL (`gen_random_uuid()`, `NOW()`) because Prisma generates those values in the client rather than in the database.

The domain seed comes in three files: `002_assets.sql` (asset tree, devices, tags, alarm rules, shift templates — fixed, readable UUIDs such as `10000000-0000-4000-8000-000000000003` for the Riverside pumping station), `003_telemetry.sql` (14 days of 15-minute readings; a re-run tops them up to the current time) and `004_operations.sql` (alarm history consistent with the readings, logbook, a rotating shift plan from a week back to three weeks ahead, audit trail, two dashboards). Generated rows get deterministic ids from `md5`, so re-runs skip them. Shifts are planned in `Europe/Budapest` — change `SHIFT_TIME_ZONE` at the top of the shift section to plan in another zone.

A few rules Prisma cannot express live in `init.sql` as `CHECK` constraints (an asset is not its own parent, a shift ends after it starts, widget sizes are on the grid).

## Scripts (root)

| Script | What it does |
|---|---|
| `pnpm docker:up` / `docker:logs` | Build and start the whole stack in Docker, detached / in the foreground |
| `pnpm docker:down` / `docker:clean` | Stop the stack / stop it and drop the database volume |
| `pnpm dev` | Builds `shared`, then runs shared (watch), API and web app in parallel |
| `pnpm --filter @gen-ui/shared build` | Rebuild the shared package's `dist`, which the running apps import |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Across all workspaces |
| `pnpm db:up` / `db:down` | Start / stop only the Postgres container (a new volume gets `init.sql`) |
| `pnpm db:reset` | Drop the database volume and recreate the schema from `init.sql` (then `pnpm db:seed`) |
| `pnpm db:seed` / `db:studio` | Load the demo data / Prisma Studio |

## Authentication

- **Access token**: a short-lived JWT (15 min by default) returned in the JSON body and kept **only in memory** (`frontend/src/lib/auth/token-store.ts`). It never touches Web Storage.
- **Refresh token**: an opaque random value in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. Only its SHA-256 hash is stored.
- **Rotation and reuse detection**: every refresh replaces the token. Replaying an old one outside a 10 s grace window revokes the whole login's token family (`backend/src/features/sessions/refresh-token.service.ts`).
- **Silent refresh**: when the page loads, the app first tries `POST /auth/refresh`. The axios interceptor refreshes once and retries on a 401; concurrent requests share one refresh.
- **Multiple tabs**: a Web Lock lets only one tab refresh at a time, and a `BroadcastChannel` shares the new token and logouts with the other tabs.
- **Roles**: every route requires a valid token unless it's marked `@Public()`. `@Roles(['ADMIN'])` restricts access by role. There is no public sign-up; admins manage users at `/users`.

### Your own account

`/profile` (also in the user menu) lets any signed-in user change their display name and password, backed by `/api/profile` (`backend/src/features/profile`).

Changing a password verifies the current one, then writes the new hash and revokes every refresh token for that account **in one transaction**. The tab that made the change is issued a fresh token pair, so it stays signed in while every other device is signed out.

Email is not editable: it is the sign-in identifier, and changing it safely needs a verification flow this app doesn't have. Admins can't change it either. Role and active status are never self-editable — the profile schemas are strict, so sending those fields is a 400 rather than a silent no-op.

## Generative UI

Ask "all admins, and also users named John" and the answer contains two live users tables: the same `UsersTable` component as the Users page, with every column and, for admins, the same row actions (make admin, deactivate, reactivate). Each has **Open in new tab**, which opens `/users` with that table's filters; the new tab starts with the assistant panel closed. The full flow, with diagrams, is in [`docs/ai-assistant-flow.md`](docs/ai-assistant-flow.md).

**What is AI-driven, and what isn't.** Claude decides only three things: whether to answer, refuse or look something up; which tool to call with which filters (the tool *input*); and the wording of the answer. Everything else is ordinary code: authorization, validation, the database query, which component draws a tool call, and the data in that component (fetched through the REST API, like its page). The numbered flow at the top of `backend/src/features/ai/ai.service.ts` marks each step `[app]` or `[AI]`.

1. The backend calls `streamText` with the tools the user's role may use and pipes an AI SDK UI message stream (SSE) back to the client (`backend/src/features/ai`).
2. **Tools call services, never controllers or repositories.** A tool is an inbound adapter like a controller, so the chat gets the same rules and mapping as the REST API. Guards don't run for tool calls, so each tool declares its roles in `TOOL_ROLES` (the chat's `@Roles`).
3. A tool's input is a page query: apart from its `title`, every field of `listUsers` (`search`, `role`, `status`, `lastSignIn`) is a `/users` URL parameter. The chat renders the tool call as that page's table, which fetches its own data, and links to the page with the same query. "Deactivated users who never signed in" becomes `status: DEACTIVATED, lastSignIn: never`; "who signed in yesterday" becomes a date, because each request tells Claude today's date in the user's time zone.
4. `features/assistant/tool-parts.tsx` maps each tool to its view, according to the part's state (`input-streaming` → skeleton, input complete → the table, `output-error` → an alert).

**The system prompt is generic.** It holds the app's pages, the rules for using tools and the out-of-scope refusal, and never names a tool. What a tool does and how to fill its fields lives in its `description` and field `.describe()` texts in `packages/shared/src/assistant.ts`, which Claude receives with the tool.

**Generate UI components** (a switch above the message box, on by default): turned off, the assistant still looks data up but answers in Markdown, and each lookup shows as one line with the same link. Each answer keeps the mode it was given in.

**Conversations are saved** per user in the `conversations` table, with the AI SDK's messages (parts included) as JSONB. The client sends only its new message; the server holds the history, saves it before the model runs and again when the stream ends (also after Stop). Reopening the app restores the thread and its tables, which show current data. **Clear chat** deletes it for good. Each turn sends the whole conversation to Claude, so a long chat costs more per answer.

To add a domain:
1. Add its tool schema to `genUiToolSchemas` in `packages/shared/src/assistant.ts`, with a description on every field.
2. Implement the tool in `backend/src/features/ai/ai.tools.ts`, calling that domain's service, and add its `TOOL_ROLES` line.
3. Add a renderer in `tool-parts.tsx` that wraps the domain's existing table. Role-based row actions belong inside that table (as `useUserActions` does in `users-table.tsx`), so the page and the chat show the same ones.

TypeScript fails the build if the backend tools and the shared contract drift apart, or if a tool has no renderer.

The assistant is available as a right-hand panel on every page (Ctrl/Cmd + J) and as a full page at `/assistant`. Both show the same conversation. Pages can describe themselves to the assistant with `useAssistantContext()`.

### Model and effort

Two pickers above the message box choose, per message, **which Claude model answers** and **how hard it works**. Both are remembered in the browser and sent with each request, and every answer is labelled with the model and effort that produced it.

| Model | Id | Effort levels | Thinking |
|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | low · medium · high (default) · extra-high · max | adaptive |
| Claude Sonnet 5 | `claude-sonnet-5` | same | adaptive |
| Claude Haiku 4.5 (default, cheapest) | `claude-haiku-4-5` | none, so the picker hides | none |

The list lives in `ASSISTANT_MODELS` (`packages/shared/src/assistant.ts`), and the server rejects any other id. `DEFAULT_ASSISTANT_MODEL` (Haiku) is what the picker starts on and what the server uses when a request names no model; a model picked earlier stays picked in that browser. Claude 3 Opus, 3.5 Sonnet and 3 Haiku are retired by Anthropic (they return 404) and never had effort levels, so each tier uses its current model. Lower effort is faster and cheaper; for simple lookups like these, low or medium is usually enough.

Don't add `temperature`/`topP`/`budgetTokens`: the Claude 5 models reject them with a 400. `AI_REFUSAL_FALLBACK=true` enables Anthropic's server-side refusal fallback on Claude Opus 5, and `AI_MAX_OUTPUT_TOKENS` caps answer length (Haiku 4.5 at most 64000). The only key the app needs is `ANTHROPIC_API_KEY`.

## Operations

**Health checks.** `GET /api/health/live` has no dependencies and answers as long as the process can serve — use it for liveness, so a database blip doesn't get a healthy container restarted. `GET /api/health/ready` pings the database and answers 503 when it is unreachable — use it for readiness and load-balancer membership. `GET /api/health` is kept for existing callers and behaves like `/ready`.

**Errors.** Every error response carries `statusCode`, `message`, `timestamp` and `path`; handlers add their own fields on top (auth errors carry a machine-readable `code`). Unexpected failures are logged with a stack server-side and return a generic message to the client (`backend/src/common/all-exceptions.filter.ts`).

**Refresh-token retention.** Rows are kept after logout and rotation because they are what makes reuse detection work. A daily job (03:00) deletes tokens more than `REFRESH_TOKEN_PRUNE_AFTER_DAYS` (default 30) past expiry, so the table doesn't grow without bound.

## Production notes

- Serve the SPA and `/api` from the **same origin** behind a reverse proxy, set `COOKIE_SECURE=true` and `TRUST_PROXY`, disable proxy buffering for `/api/ai/chat`, and pass WebSocket upgrades (`Upgrade`/`Connection` headers) for `/api/socket.io`. `frontend/nginx.conf` is a working example of all of this.
- Notifications go to every connected tab of one API process. Behind several API instances, add the Socket.IO Redis adapter so a broadcast reaches them all.
- Set `NODE_ENV=production`. Configuration is validated at boot and fails fast: in production `COOKIE_SECURE` must be true and `ANTHROPIC_API_KEY` must be present.
- Replace the development `JWT_ACCESS_SECRET` from `docker-compose.yml` with a real one (`openssl rand -base64 48`, at least 32 characters).
- For split origins, set `CORS_ORIGIN` (comma-separated) and `VITE_API_BASE_URL`. The cookie stays `SameSite=Strict`, so the frontend and API must be on the same site (e.g. `app.example.com` + `api.example.com`).
- There is **no rate limiting**. This is a student project and 429s were getting in the way; if the app is ever exposed publicly, put a limiter in front of `/api/auth/login` (or restore `@nestjs/throttler`, removed in this branch's history).
- `/docs` is public. It only describes routes that are guarded anyway, but if you would rather
  not publish the API's shape, drop the `setupSwagger(app)` call in `backend/src/main.ts` or put
  the path behind your proxy's own auth.
- The `users` search filter is an unanchored `ILIKE`. It has no index; add a `pg_trgm` GIN index if that listing gets large.
