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

#### Frontend work in Docker (hot reload)

`docker:up` serves a production build, so every frontend edit means another `tsc -b` + `vite build` and a new image. For frontend work, use the dev mode instead:

```bash
pnpm docker:dev                   # same stack, but the web app is the Vite dev server
```

`docker-compose.dev.yml` layers over `docker-compose.yml`: the frontend container runs Vite (the `dev` target in `frontend/Dockerfile`) behind the same <http://localhost:5173>, and `docker compose watch` copies every edit under `frontend/` and `packages/shared/` into the running container, where Vite hot-reloads it. Nothing is rebuilt. Only a change to a `package.json` or `pnpm-lock.yaml` rebuilds the frontend image, and watch does that by itself.

- Vite's output: `docker compose logs -f frontend`.
- Ctrl+C stops watching, but the stack keeps running. Stop it with `pnpm docker:down`, or switch back to the production build with `pnpm docker:up`.
- The API still runs from its image. After a backend change, run `pnpm docker:dev` again (the dependency layers are cached, so only the backend is recompiled).
- `frontend/src/routeTree.gen.ts` is regenerated inside the container only. After adding a route file, run `pnpm --filter frontend build` locally once, so your copy (which is committed) and your editor know the new route.

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
| `/shifts` | `/api/shifts/*` | Shift calendar (month, week, day), staffing gaps, shift templates, who is on duty now |
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

Tables and charts (`AlarmsTable`, `TelemetryChart`, `LogbookTable`, `TagsTable`, …) take that query as a prop and fetch their own data. A page feeds them from its URL; an embed (a dashboard widget, an asset page card, a chat answer) passes a fixed query and adds **View full page** — a plain link to the page with the same query. A dashboard widget's `config` *is* such a query (`WIDGET_CONFIG_SCHEMAS`), and `features/dashboards/widget-registry.tsx` maps each widget type to its view and its full page; a GenUI tool emitting `{ type, config }` can render through that same registry.

### Alarms, end to end

A reading arrives (`POST /api/telemetry/measurements`, or the simulator) → the tag's latest value moves → every enabled rule on the tag is evaluated, with the rule rows locked so concurrent readings can't double-raise → a firing value raises an `ACTIVE` alarm; a value back past the threshold by the **deadband** clears it (`CLEARED`, or `CLOSED` if already acknowledged). Acknowledging moves `ACTIVE → ACKNOWLEDGED` / `CLEARED → CLOSED`. Every transition is written to the logbook (the alarm's timeline is `GET /api/logbook?alarmId=…`), and every user action to the audit log, in the same transaction as the change.

**The simulator** (`SIMULATOR_ENABLED`, default on) writes a reading for every tag of an `ONLINE` device every `SIMULATOR_INTERVAL_SECONDS` through that same ingest path, with an occasional excursion that trips the seeded rules — so charts move and alarms come and go in a demo. Turn it off when real data flows in. Measurements older than `TELEMETRY_RETENTION_DAYS` (180) are pruned daily.

### Real-time notifications

The bell in the header shows alarm notifications the moment the server sends them, over a **WebSocket** — nothing polls. Every signed-in tab opens one Socket.IO connection (namespace `/notifications`, path `/api/socket.io`, WebSocket transport only), so it travels through the Vite proxy and nginx like the rest of `/api`, on the web app's own origin.

- **Server:** `backend/src/features/notifications`. `NotificationsGateway` (`@WebSocketGateway`) checks the access token in the socket handshake exactly as the REST guard does (signature, expiry, active account) and refuses the connection otherwise. A producer calls `NotificationsGateway.broadcast(notification)`; the payload is `AppNotificationSchema` in `packages/shared/src/notifications.ts`.
- **Browser:** `frontend/src/features/notifications`. The app shell opens the socket after sign-in and closes it on sign-out; a reconnect sends a fresh token. The bell counts unread notifications, lists the latest 50 (severity, text, asset link, time), and marks them read when its popover closes. The list lives in the tab's memory.
- **Demo alarms (temporary):** until real alarms are wired in, `MockAlarmNotifier` runs every 60 s and, when `Math.random() < 0.4` (40% of the ticks), pushes a made-up alarm on a random analog tag (marked *Demo alarm*; nothing is stored). `MOCK_ALARM_NOTIFICATIONS=false` turns it off. To go live, have the alarm evaluator broadcast each alarm it raises, after its transaction commits, and delete the mock.

### Users

`/users` filters by name or email, role, **status** (active / deactivated) and **last sign-in**: *All*, *Never signed in*, or *Exact date* with a date picker. They are URL and API parameters like every other list filter: `GET /api/users?status=DEACTIVATED&lastSignIn=never`, or `lastSignIn=2026-05-03` for a day. That day is read in `timeZone`, which the web app sets to the browser's zone, so the filter matches the date the *Last sign-in* column shows. Choosing *Exact date* opens an empty date field; nothing is filtered until a date is picked.

### Shifts

`/shifts` is a calendar of who works when, in three views: **Month** (per day, one line per shift with the initials of who is on it), **Week** (rows per shift, the roster, or rows per person with their hours) and **Day** (a midnight-to-midnight timeline with a now-line). The page's URL is the calendar's query, `GET /api/shifts/calendar?view=week&date=2026-10-05&role=SUPERVISOR` (`ShiftCalendarQuerySchema`); `group=person` only changes how the week is drawn (`ShiftsPageQuerySchema`). Above it, *On duty now* — the people alarm escalation would page — and who takes over next (`GET /api/shifts/on-duty`). The calendar (`ShiftCalendar`), the on-duty strip (`OnDutyStrip`) and the schedule, edit, copy and template forms are one set of components: the page, the assistant's answers and the *On duty* dashboard widget all render them, with props for what differs (`controls={false}` drops the calendar's toolbar; `only="now"` shows one half of the strip).

- **Plant time zone.** Every date and time is in `SHIFT_TIME_ZONE` (default `Europe/Budapest`): a template's "06:00" is 06:00 there, a day runs from midnight to midnight there, and a shift belongs to the day it starts on there. A shift's length is wall-clock: Night, 22:00 + 8 h, ends at 06:00 even on the nights the clocks change (it then runs 7 or 9 hours), so it still meets the morning shift. Changing the zone later re-files existing shifts by the new zone.
- **Staffing targets.** A template's `coverage` says whom it needs on which weekdays (Morning: an operator every day, a supervisor Monday–Friday). The calendar marks every day where a target isn't met, by role, and admins schedule into the gap from there. Deactivated people keep their shifts but no longer count, so their gaps show.
- **Series.** Repeating a shift weekly creates a series. Changing or removing one of its shifts asks whether to apply to it, to it and the following ones, or to the whole series (`?scope=one|following|series`); wider scopes leave shifts that already started alone. Only one shift at a time can move to another day, time or template — doing so, or handing it to someone else, takes it out of its series.
- **Copy a week.** `POST /api/shifts/assignments/copy-week` repeats a week's shifts in the next 1–8 weeks at the same local times. All or nothing, like scheduling.
- **No double booking.** Nobody can be on two overlapping shifts. The API checks first and names the clash (409); a Postgres exclusion constraint (`shift_assignments_no_overlap`) backs it against concurrent requests.

### Asset and people filters

Alarms, alarm rules, logbook, devices and tags filter by asset with the asset dropdown (`assetId`). It covers the asset and everything below it, so picking a site brings all its equipment. The logbook's *Author* and the audit log's *Who* filter by people (`authorId`, `actorId`). The assistant fills these same ids, so its links open with the dropdowns already set (see [Generative UI](#generative-ui)).

`search` never matches asset names: asset names are full of common words ("Pump", "Reservoir", "Tank"), so "pump rules" would otherwise return every rule at a pumping station.

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

The domain seed comes in three files: `002_assets.sql` (asset tree, devices, tags, alarm rules, shift templates — fixed, readable UUIDs such as `10000000-0000-4000-8000-000000000003` for the Riverside pumping station), `003_telemetry.sql` (14 days of 15-minute readings; a re-run tops them up to the current time) and `004_operations.sql` (alarm history consistent with the readings, logbook, a rotating shift plan from a week back to three weeks ahead, audit trail, two dashboards). Generated rows get deterministic ids from `md5`, so re-runs skip them. Shifts are planned in the plant time zone, `SHIFT_TIME_ZONE` (the seed runner passes it to the SQL), each person's week on a shift is a series, and the night shift nine days ahead is left empty so the calendar has a staffing gap to show.

A few rules Prisma cannot express live in `init.sql` as `CHECK` and exclusion constraints (an asset is not its own parent, a shift ends after it starts, nobody is on two shifts at once, widget sizes are on the grid).

## Scripts (root)

| Script | What it does |
|---|---|
| `pnpm docker:up` / `docker:logs` | Build and start the whole stack in Docker, detached / in the foreground |
| `pnpm docker:dev` | The stack in Docker with the Vite dev server; frontend and shared edits hot-reload without a rebuild |
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

Ask "all admins, and also users named John" and the answer contains two live users tables: the same `UsersTable` component as the Users page, with every column and, for admins, the same row actions (make admin, deactivate, reactivate). Each has **Open in new tab**, which opens `/users` with that table's filters. The full flow, with diagrams, is in [`docs/ai-assistant-flow.md`](docs/ai-assistant-flow.md).

The assistant has one tool per domain view, one that draws a chart, two for shifts (the calendar and the on-duty card), and sixteen that open a form:

| Tool | Who may use it | What Claude can filter by | Renders | Opens |
|---|---|---|---|---|
| `listAlarms` | everyone | words from the alarm (message, rule, tag), asset, state, severity, when it was raised | `AlarmsTable`; a click opens the alarm's sheet (acknowledge, clear, chart, timeline) | `/alarms` |
| `listAlarmRules` | everyone | rule or tag name, asset, severity, condition, enabled | `DefinitionsTable`; admins get edit, delete, enable/disable | `/alarm-rules` |
| `listLogbookEntries` | everyone | words from the entry, kind, severity, source (people or system), author, asset, when it happened | `LogbookTable`; authors edit their entries, authors and admins delete them | `/logbook` |
| `showShiftCalendar` | everyone | the period (week, month or day, around a plant date), week rows by shift or by person, people, shifts (by id, from the prompt's shift template list), roles | the Shifts page's `ShiftCalendar` for that period, without its toolbar (no navigation, view switches or filters); admins keep the shift and gap actions | `/shifts` |
| `showOnDuty` | everyone | `when`: now or next (one per call), roles | the page's on-duty strip (`OnDutyStrip`), only the half asked for, with the link in its corner | `/shifts` |
| `listDevices` | everyone | name, serial number, model or manufacturer, asset, status, protocol | `DevicesTable`; admins get edit, delete | `/devices` |
| `listTags` | everyone | name, code or unit, asset, type (analog, digital, counter) | `TagsTable` with live values; chart for everyone, and add a rule, edit, delete for admins | `/tags` |
| `listAssets` | everyone | name or code, level (region, site, area, equipment), a branch of the tree, direct children of one asset, in or out of service | `AssetsTable`; a click opens the asset's page, admins get edit, delete | `/assets` |
| `listUsers` | everyone | name or email, role, status, last sign-in | `UsersTable`; admins get make admin, deactivate, reactivate | `/users` |
| `plotTags` | everyone | up to 8 tags (by id, from the prompt's tag list), a time window, bucket size, aggregate, chart type | the Graphs page's filter bar and chart (`TelemetryExplorer`), without the stats table; changing a filter redraws in place and moves **Open in new tab** along | `/graphs` |
| `listAuditLogs` | admins | action (a family such as `alarm_definition.` or an exact one such as `alarm.acknowledge`), who acted, words from the summary, a time window | `AuditTable`, read-only | `/audit` |
| `createUser` | admins | pre-fills name, email, role (never a password) | the Add user form, inside the answer | `/users`, once saved |
| `createAlarmRule` | admins | pre-fills the tag (by id, from the prompt's tag list), name, condition, threshold, deadband, severity, description, enabled | the New alarm rule form, inside the answer | `/alarm-rules`, once saved |
| `editAlarmRule` | admins | the rule (by id, from the prompt's rule list) and only the values to change | the Edit alarm rule form, loaded with the rule's current values | `/alarm-rules`, once saved |
| `createDevice` | admins | pre-fills the asset (by id, from the asset tree), name, serial number, model, manufacturer, protocol, status, firmware, IP address, installed date | the Register a device form, inside the answer | `/devices`, once saved |
| `editDevice` | admins | the device (by id, from the prompt's device list) and only the values to change, including the asset it moves to | the device's edit form, loaded with its current values | `/devices`, once saved |
| `createTag` | admins | pre-fills the device (by id, from the prompt's device list), name, code, type, unit, log interval, range, description, active | the New tag form, inside the answer | `/tags`, once saved |
| `editTag` | admins | the tag (by id, from the prompt's tag list) and only the values to change (never its device) | the tag's edit form, loaded with its current values | `/tags`, once saved |
| `createAsset` | admins | pre-fills the parent (by id, from the asset tree), name, code, type, description, address, coordinates, in service | the New asset form, inside the answer | `/assets`, once saved |
| `editAsset` | admins | the asset (by id, from the asset tree) and only the values to change, including a new parent (it moves with everything below it) | the asset's edit form, loaded with its current values | `/assets`, once saved |
| `createLogbookEntry` | everyone | pre-fills the kind, severity, title and details (in the user's words), the asset (by id, from the asset tree), when it happened | the Write in the logbook form, inside the answer | `/logbook`, once saved |
| `editLogbookEntry` | everyone, own entries only | the entry (by id, from the prompt's list of the user's own latest entries) and only the values to change | the entry's edit form, loaded with its current values | `/logbook`, once saved |
| `scheduleShift` | admins | pre-fills the person and shift (by id), role, the plant date, own hours, a weekly repeat, notes | the Schedule a shift form, inside the answer | `/shifts`, once saved |
| `editShift` | admins | the shift, named by person + the plant day it starts (+ which shift, if they work two), the scope for a series, and only the values to change | the shift's edit form, loaded with its current values | `/shifts`, once saved |
| `copyShiftWeek` | admins | the week (a plant date), how many weeks after it, only some people or shifts | the Copy week form, inside the answer | `/shifts`, once saved |
| `createShiftTemplate` | admins | pre-fills the name, start, length, colour, active, staffing targets | the New shift template form, inside the answer | `/shifts`, once saved |
| `editShiftTemplate` | admins | the template (by id, from the prompt's shift template list) and only the values to change | the template's edit form, loaded with its current values | `/shifts`, once saved |

Questions to try:
- Alarms: "open alarms at Riverside", "critical alarms raised today", "which alarms still need acknowledging".
- Logbook: "maintenance work last week", "what did Ava write in the logbook", "device events at the reservoir".
- Devices and tags: "devices that are offline or faulted", "what is the wet well level at PS-01 right now", "digital signals at Riverside".
- Charts: "show the wet well level for the last 7 days", "compare the pump flows at Riverside since yesterday", "daily peaks of outlet pressure this month as bars", "nivo u mokrom bunaru danas".
- Alarm rules: "rules that are switched off", "critical rules at Riverside".
- Shifts: "who works next week?", "Noah's shifts in October", "where are we short-staffed this month", "who is on duty now?", "who takes over next?" (one card each; asking for both gives two).
- Audit log (admins): "what did Ava change last week", "who acknowledged alarms yesterday", "deleted devices in the last 30 days".
- Several at once: "open alarms at Riverside, and the devices there".
- Forms (admins, components on): "I want to create a new rule" (opens the empty form, as on the page), "create a user named Milan Milanović", "new critical rule when the outlet pressure at PS-01 goes above 9.5 bar", "raise the threshold of wet wel hihg levl to 5", "izmeni pravilo za nizak nivo u mokrom bunaru", "register a new device at Hilcrest", "put the PS-02 RTU into maintenance", "add an outlet flow tag in m³/h to the PS-01 RTU", "log the inlet pressure every 30 seconds", "add Pump 3 under the pump hall at Riverside, code PS-01-P3", "take pump 2 at Riverside out of service", "move Tank 1 under Riverside", "schedule Sofia on mornings every weekday until the end of the month", "give Noah's Saturday night to Liam", "copy this week to the next 3 weeks", "add a 12-hour weekend day shift", "switch off the afternoon shift".
- Logbook forms (everyone, components on): "log that I replaced the seal on pump 2 at Riverside", "write a shift handover: quiet night, reservoir at 4.1 m", and as Liam Carter "make my last handover a warning".

**What is AI-driven, and what isn't.** Claude decides only three things: whether to answer, refuse or look something up; which tool to call with which filters (the tool *input*); and the wording of the answer. Everything else is ordinary code: authorization, validation, the database query, which component draws a tool call, and the data in that component (fetched through the REST API, like its page). The numbered flow at the top of `backend/src/features/ai/ai.service.ts` marks each step `[app]` or `[AI]`.

1. The backend calls `streamText` with the tools the user's role may use and pipes an AI SDK UI message stream (SSE) back to the client (`backend/src/features/ai`).
2. **Tools call services, never controllers or repositories.** A tool is an inbound adapter like a controller, so the chat gets the same rules and mapping as the REST API. Guards don't run for tool calls, so each tool declares its roles in `TOOL_ROLES` (the chat's `@Roles`).
3. A tool's input is a page query: apart from its `title`, every field is a URL parameter of the tool's page (`listAlarms` → `/alarms`, `listUsers` → `/users`, and so on). The chat renders the tool call as that page's table, which fetches its own data, and links to the page with the same query. "Deactivated users who never signed in" becomes `status: DEACTIVATED, lastSignIn: never`; "open alarms at Riverside" becomes `state: [ACTIVE, ACKNOWLEDGED, CLEARED], assetId: <Riverside's id>`. Each request tells Claude the current date, time and UTC offset in the user's time zone, so "who signed in yesterday" becomes a date and "alarms raised yesterday" becomes a `from`/`to` window on the user's calendar day.
4. `features/assistant/tool-parts.tsx` maps each tool to its view, according to the part's state (`input-streaming` → skeleton, input complete → the table, `output-error` → an alert).

**The system prompt is generic.** It holds the app's pages, the rules for using tools, the language rule and the out-of-scope refusal, and never names a tool. What a tool does and how to fill its fields lives in its `description` and field `.describe()` texts in `packages/shared/src/assistant.ts`, which Claude receives with the tool.

**English and Serbian only.** The assistant answers in the language of the question, English or Serbian (Latin or Cyrillic). A question in any other language gets a one-line refusal in both, with no lookup.

**Assets and people come as ids, picked from the dropdowns' own lists.** Every request adds two lists to the prompt: the asset tree (`AssetsService.tree()`, what the asset dropdown shows) and the active people (`UsersService.options()`, what *Author* and *Who* show), each entry with its id. Claude matches the user's words to an entry, typos included ("hilcrest" → Hillcrest Reservoir), and writes its id into the tool input. The chat table, **Open in new tab** and the page's dropdown then all show that same asset or person. If a name fits several entries equally (there are several pumps), Claude asks which one. If none fits, it says so. A tool rejects an id that isn't on the lists, so a miscopied id can't quietly return an empty table. The lists are never cut: every asset and every active person is listed, so they cost about 500 input tokens per message with the demo data and grow with the tree and the staff. Every tag is listed too, because the chart tool (offered to everyone, with components on or off) takes tags by id, and so is every shift template (`<shift-templates>`, with its plant-time hours), which the shift calendar filters by. Shift dates are the plant's (`SHIFT_TIME_ZONE`), so the session also gives the plant's date and time next to the user's. With components on, the prompt also lists, the same way, what the offered form tools take by id: every device, tag and alarm rule for admins, and each user's own 30 latest logbook entries (the only ones they may edit): Claude matches "wet wel hihg levl" to Wet well high level, or asks "high or low?" for "the wet well level rule". No code matches names.

**Forms in the answer.** The form tools open the app's own form inside the answer: the same header, fields, button and top-right X as the modal on its page (`InlineDialog` draws the dialog in place). Claude fills in what the user said; for an edit, the form loads the record as it is now and puts the requested changes over it, each changed field hinting what it was. The tools never write anything: the user saves through the same REST endpoint the modal uses. Afterwards the browser reports what happened (`PUT /api/ai/conversations/:id/forms/:toolCallId`, saved with the record's id — and every id, for a form that saves several shifts — or closed), and the server writes it into that tool call in the saved conversation, reading the record itself. The form then becomes a one-line result, also after a reload, and Claude knows on its next turn. That costs no model call. Details in [`docs/ai-assistant-flow.md`](docs/ai-assistant-flow.md#4-forms-in-the-chat-open-save-record).

**Generate UI components** (a switch above the message box, on by default): turned off, the assistant still looks data up but answers in Markdown, and each lookup shows as one line with the same link. Forms need it on: with it off, asking for one ("add a rule…") gets a pointer to this switch, or to the page, instead of questions about the values. A user (not an admin) has only the logbook forms; asking for another is told only admins can do that. Each answer keeps the mode it was given in.

**Conversations are saved** per user in the `conversations` table, with the AI SDK's messages (parts included) as JSONB. The client sends only its new message; the server holds the history, saves it before the model runs and again when the stream ends (also after Stop). Reopening the app restores the thread and its tables, which show current data. **Clear chat** deletes it for good. Each turn sends the whole conversation to Claude, so a long chat costs more per answer.

To add a domain:
1. Add its tool schema to `genUiToolSchemas` in `packages/shared/src/assistant.ts`, with a description on every field.
2. Implement the tool in `backend/src/features/ai/ai.tools.ts`, calling that domain's service, and add its `TOOL_ROLES` line. Export the service from its module and import that module in `ai.module.ts`.
3. Add a renderer in `tool-parts.tsx` that wraps the domain's existing table (or view: the shift calendar, the on-duty strip). Role-based row actions belong inside that view, with their dialogs (the `use…Actions` hooks in `users-table.tsx`, `definitions-table.tsx`, `devices-table.tsx`, `tags-table.tsx`, `assets-table.tsx`, `logbook-table.tsx` and `features/shifts/use-shift-actions.tsx`), so the page and the chat show the same ones. What differs in the chat is a prop on the same component, never a copy of it. A filter a page sets with an asset or people dropdown takes the same ids in the tool; Claude picks them from the lists in its prompt.

TypeScript fails the build if the backend tools and the shared contract drift apart, or if a tool has no renderer. A tool that creates or edits something is a form tool instead; see "Adding a form tool" in [`docs/ai-assistant-flow.md`](docs/ai-assistant-flow.md#adding-the-next-domain).

The assistant has its own page at `/assistant`, linked from the sidebar. The assistant doesn't know which page is open; each request carries only the browser's time zone besides the settings.

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
