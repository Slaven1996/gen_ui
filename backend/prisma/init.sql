-- ════════════════════════════════════════════════════════════════════════════
-- Gen UI — the database schema (PostgreSQL 17)
--
-- The one place the database structure is defined. The Postgres container
-- runs this file once, when its data volume is empty (it is mounted into
-- /docker-entrypoint-initdb.d by docker-compose.yml), so a fresh
-- `docker compose up` or `pnpm db:up` creates every table. Demo data is
-- loaded afterwards by the API: backend/prisma/seed/*.sql (`pnpm db:seed`, or
-- SEED_ON_START in Docker).
--
-- backend/prisma/schema.prisma describes the same tables for the Prisma
-- client. Change the two together: edit the table here and the model there,
-- run `pnpm --filter backend db:generate`, then `pnpm db:reset` to rebuild
-- the local database from this file.
--
-- Names follow Prisma's conventions (`<table>_pkey`, `<table>_<columns>_key`,
-- `_idx`, `_fkey`), so the database matches what the client expects.
-- Prisma fills `id` and `updated_at` in the client, which is why neither has
-- a database default: SQL inserts set them (gen_random_uuid(), NOW()).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Enums ──────────────────────────────────────────────────────────────────

-- Users & sessions
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "RevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'USER_DISABLED', 'ROLE_CHANGED', 'PASSWORD_CHANGED');

-- Assets & telemetry
CREATE TYPE "AssetType" AS ENUM ('REGION', 'SITE', 'AREA', 'EQUIPMENT');
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'FAULT');
CREATE TYPE "DeviceProtocol" AS ENUM ('MODBUS_TCP', 'OPC_UA', 'MQTT', 'IEC_104', 'DNP3', 'OTHER');
CREATE TYPE "TagDataType" AS ENUM ('ANALOG', 'DIGITAL', 'COUNTER');
CREATE TYPE "MeasurementQuality" AS ENUM ('GOOD', 'UNCERTAIN', 'BAD');

-- Alarms
CREATE TYPE "AlarmSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
CREATE TYPE "AlarmCondition" AS ENUM ('ABOVE', 'BELOW', 'EQUAL', 'NOT_EQUAL');
CREATE TYPE "AlarmState" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'CLEARED', 'CLOSED');

-- Logbook & audit
CREATE TYPE "LogbookCategory" AS ENUM ('NOTE', 'ALARM', 'DEVICE', 'MAINTENANCE', 'SHIFT');
CREATE TYPE "LogSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AuditEntityType" AS ENUM ('ASSET', 'DEVICE', 'TAG', 'ALARM_DEFINITION', 'ALARM', 'LOGBOOK_ENTRY', 'SHIFT_TEMPLATE', 'SHIFT_ASSIGNMENT', 'DASHBOARD', 'USER');

-- Shifts & dashboards
CREATE TYPE "ShiftRole" AS ENUM ('OPERATOR', 'SUPERVISOR', 'ON_CALL');
CREATE TYPE "WidgetType" AS ENUM ('KPI', 'TAG_VALUE', 'TIME_SERIES', 'ALARM_TABLE', 'ALARM_TREND', 'TOP_ALARMS', 'LOGBOOK_FEED', 'DEVICE_STATUS', 'ON_DUTY');

-- ─── Users & sessions ───────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id"            UUID         NOT NULL,
    "email"         TEXT         NOT NULL, -- always stored lowercased
    "name"          TEXT         NOT NULL,
    "password_hash" TEXT         NOT NULL,
    "role"          "Role"       NOT NULL DEFAULT 'USER',
    "is_active"     BOOLEAN      NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
-- The admin listing: ORDER BY created_at DESC, filtered by role / is_active.
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- Opaque refresh tokens (only the SHA-256 hash is stored). Every refresh
-- rotates the token; all tokens of one login share a family_id.
CREATE TABLE "refresh_tokens" (
    "id"             UUID           NOT NULL,
    "token_hash"     TEXT           NOT NULL,
    "family_id"      UUID           NOT NULL,
    "user_id"        UUID           NOT NULL,
    "expires_at"     TIMESTAMP(3)   NOT NULL,
    "revoked_at"     TIMESTAMP(3),
    "revoked_reason" "RevokeReason",
    "replaced_by_id" UUID,
    "user_agent"     TEXT,
    "ip"             TEXT,
    "created_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id")
        REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- ─── Assets & telemetry ─────────────────────────────────────────────────────

-- A node of the asset tree: region > site > area > equipment. `path` is the
-- materialized path of ids (/<root>/…/<self>/), maintained by AssetsService.
CREATE TABLE "assets" (
    "id"          UUID             NOT NULL,
    "parent_id"   UUID,
    "path"        TEXT             NOT NULL,
    "code"        TEXT             NOT NULL,
    "name"        TEXT             NOT NULL,
    "type"        "AssetType"      NOT NULL,
    "description" TEXT,
    "latitude"    DOUBLE PRECISION,
    "longitude"   DOUBLE PRECISION,
    "address"     TEXT,
    "is_active"   BOOLEAN          NOT NULL DEFAULT true,
    "metadata"    JSONB,
    "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_parent_id_fkey" FOREIGN KEY ("parent_id")
        REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assets_not_own_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");
CREATE INDEX "assets_parent_id_idx" ON "assets"("parent_id");
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- A physical unit that reports data: an RTU, PLC, gateway or smart sensor.
CREATE TABLE "devices" (
    "id"               UUID             NOT NULL,
    "asset_id"         UUID             NOT NULL,
    "name"             TEXT             NOT NULL,
    "serial_number"    TEXT             NOT NULL,
    "model"            TEXT,
    "manufacturer"     TEXT,
    "protocol"         "DeviceProtocol" NOT NULL DEFAULT 'MODBUS_TCP',
    "status"           "DeviceStatus"   NOT NULL DEFAULT 'OFFLINE',
    "firmware_version" TEXT,
    "ip_address"       TEXT,
    "installed_at"     TIMESTAMP(3),
    "last_seen_at"     TIMESTAMP(3),
    "created_at"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "devices_asset_id_fkey" FOREIGN KEY ("asset_id")
        REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");
CREATE INDEX "devices_asset_id_idx" ON "devices"("asset_id");
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- A datapoint (signal) a device reports. `last_value` is the latest reading,
-- denormalized so lists and widgets need no time-series query.
CREATE TABLE "tags" (
    "id"                   UUID             NOT NULL,
    "device_id"            UUID             NOT NULL,
    "code"                 TEXT             NOT NULL,
    "name"                 TEXT             NOT NULL,
    "description"          TEXT,
    "unit"                 TEXT,
    "data_type"            "TagDataType"    NOT NULL DEFAULT 'ANALOG',
    "min_value"            DOUBLE PRECISION,
    "max_value"            DOUBLE PRECISION,
    "log_interval_seconds" INTEGER          NOT NULL DEFAULT 60,
    "last_value"           DOUBLE PRECISION,
    "last_value_at"        TIMESTAMP(3),
    "is_active"            BOOLEAN          NOT NULL DEFAULT true,
    "created_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tags_device_id_fkey" FOREIGN KEY ("device_id")
        REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tags_device_id_code_key" ON "tags"("device_id", "code");

-- Time-series readings. The composite key doubles as the (tag, time) index
-- every chart query uses.
CREATE TABLE "measurements" (
    "tag_id"  UUID                 NOT NULL,
    "ts"      TIMESTAMPTZ(3)       NOT NULL,
    "value"   DOUBLE PRECISION     NOT NULL,
    "quality" "MeasurementQuality" NOT NULL DEFAULT 'GOOD',

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("tag_id", "ts"),
    CONSTRAINT "measurements_tag_id_fkey" FOREIGN KEY ("tag_id")
        REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── Alarms ─────────────────────────────────────────────────────────────────

-- A rule evaluated against every new reading of its tag. `deadband` is the
-- hysteresis: how far back past the threshold the value must go to clear.
CREATE TABLE "alarm_definitions" (
    "id"          UUID             NOT NULL,
    "tag_id"      UUID             NOT NULL,
    "name"        TEXT             NOT NULL,
    "description" TEXT,
    "condition"   "AlarmCondition" NOT NULL,
    "threshold"   DOUBLE PRECISION NOT NULL,
    "deadband"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severity"    "AlarmSeverity"  NOT NULL DEFAULT 'MEDIUM',
    "is_enabled"  BOOLEAN          NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "alarm_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alarm_definitions_tag_id_fkey" FOREIGN KEY ("tag_id")
        REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "alarm_definitions_tag_id_idx" ON "alarm_definitions"("tag_id");

-- One occurrence of a rule firing. tag_id, asset_id and severity are copied at
-- raise time, so history stays true after the rule or the asset tree changes.
CREATE TABLE "alarms" (
    "id"                 UUID             NOT NULL,
    "definition_id"      UUID             NOT NULL,
    "tag_id"             UUID             NOT NULL,
    "asset_id"           UUID             NOT NULL,
    "severity"           "AlarmSeverity"  NOT NULL,
    "state"              "AlarmState"     NOT NULL DEFAULT 'ACTIVE',
    "message"            TEXT             NOT NULL,
    "trigger_value"      DOUBLE PRECISION,
    "clear_value"        DOUBLE PRECISION,
    "raised_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at"         TIMESTAMP(3),
    "acknowledged_at"    TIMESTAMP(3),
    "acknowledged_by_id" UUID,
    "acknowledge_note"   TEXT,
    "updated_at"         TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alarms_definition_id_fkey" FOREIGN KEY ("definition_id")
        REFERENCES "alarm_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "alarms_tag_id_fkey" FOREIGN KEY ("tag_id")
        REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "alarms_asset_id_fkey" FOREIGN KEY ("asset_id")
        REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "alarms_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "alarms_state_severity_idx" ON "alarms"("state", "severity");
CREATE INDEX "alarms_raised_at_idx" ON "alarms"("raised_at");
CREATE INDEX "alarms_asset_id_idx" ON "alarms"("asset_id");
CREATE INDEX "alarms_definition_id_cleared_at_idx" ON "alarms"("definition_id", "cleared_at");

-- ─── Logbook & audit ────────────────────────────────────────────────────────

-- The operator logbook: notes people write and events the system records
-- (author_id is NULL for system events).
CREATE TABLE "logbook_entries" (
    "id"          UUID              NOT NULL,
    "category"    "LogbookCategory" NOT NULL,
    "severity"    "LogSeverity"     NOT NULL DEFAULT 'INFO',
    "title"       TEXT              NOT NULL,
    "body"        TEXT,
    "occurred_at" TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id"    UUID,
    "alarm_id"    UUID,
    "author_id"   UUID,
    "created_at"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "logbook_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "logbook_entries_asset_id_fkey" FOREIGN KEY ("asset_id")
        REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "logbook_entries_alarm_id_fkey" FOREIGN KEY ("alarm_id")
        REFERENCES "alarms"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "logbook_entries_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "logbook_entries_occurred_at_idx" ON "logbook_entries"("occurred_at");
CREATE INDEX "logbook_entries_category_occurred_at_idx" ON "logbook_entries"("category", "occurred_at");
CREATE INDEX "logbook_entries_asset_id_idx" ON "logbook_entries"("asset_id");
CREATE INDEX "logbook_entries_alarm_id_idx" ON "logbook_entries"("alarm_id");

-- Append-only record of who changed what. `action` is `<entity>.<verb>`.
CREATE TABLE "audit_logs" (
    "id"          UUID              NOT NULL,
    "actor_id"    UUID,
    "action"      TEXT              NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id"   UUID,
    "summary"     TEXT              NOT NULL,
    "changes"     JSONB,
    "created_at"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- ─── Shift scheduling ───────────────────────────────────────────────────────

-- A reusable shift pattern: "Night, 22:00, 8 hours". start_time is HH:mm.
CREATE TABLE "shift_templates" (
    "id"               UUID         NOT NULL,
    "name"             TEXT         NOT NULL,
    "start_time"       TEXT         NOT NULL,
    "duration_minutes" INTEGER      NOT NULL,
    "color"            TEXT         NOT NULL,
    "is_active"        BOOLEAN      NOT NULL DEFAULT true,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shift_templates_name_key" ON "shift_templates"("name");

-- One person on one shift. Start and end are instants, so editing the
-- template later never rewrites past schedules.
CREATE TABLE "shift_assignments" (
    "id"            UUID         NOT NULL,
    "template_id"   UUID         NOT NULL,
    "user_id"       UUID         NOT NULL,
    "role"          "ShiftRole"  NOT NULL DEFAULT 'OPERATOR',
    "starts_at"     TIMESTAMP(3) NOT NULL,
    "ends_at"       TIMESTAMP(3) NOT NULL,
    "notes"         TEXT,
    "created_by_id" UUID,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_assignments_template_id_fkey" FOREIGN KEY ("template_id")
        REFERENCES "shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_period_check" CHECK ("ends_at" > "starts_at")
);
CREATE INDEX "shift_assignments_starts_at_ends_at_idx" ON "shift_assignments"("starts_at", "ends_at");
CREATE INDEX "shift_assignments_user_id_starts_at_idx" ON "shift_assignments"("user_id", "starts_at");

-- ─── Dashboards ─────────────────────────────────────────────────────────────

-- is_shared: readable by every signed-in user; only the owner (or an admin) edits it.
CREATE TABLE "dashboards" (
    "id"          UUID         NOT NULL,
    "owner_id"    UUID         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "is_shared"   BOOLEAN      NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dashboards_owner_id_fkey" FOREIGN KEY ("owner_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "dashboards_owner_id_idx" ON "dashboards"("owner_id");
CREATE INDEX "dashboards_is_shared_idx" ON "dashboards"("is_shared");

-- A card on a dashboard's 12-column grid. `config` is validated against the
-- widget type's Zod schema (WIDGET_CONFIG_SCHEMAS in @gen-ui/shared).
CREATE TABLE "dashboard_widgets" (
    "id"           UUID         NOT NULL,
    "dashboard_id" UUID         NOT NULL,
    "type"         "WidgetType" NOT NULL,
    "title"        TEXT         NOT NULL,
    "position"     INTEGER      NOT NULL,
    "width"        INTEGER      NOT NULL,
    "height"       INTEGER      NOT NULL,
    "config"       JSONB        NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dashboard_widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id")
        REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dashboard_widgets_size_check" CHECK ("width" IN (3, 4, 6, 8, 12) AND "height" BETWEEN 1 AND 3)
);
CREATE INDEX "dashboard_widgets_dashboard_id_position_idx" ON "dashboard_widgets"("dashboard_id", "position");

-- ─── Assistant ──────────────────────────────────────────────────────────────

-- A saved chat. `messages` holds the AI SDK's UI messages with their parts
-- (text, reasoning, tool calls with input and output). The id is created by
-- the browser when the chat starts; the row by its first message.
CREATE TABLE "conversations" (
    "id"         UUID         NOT NULL,
    "user_id"    UUID         NOT NULL,
    "title"      TEXT         NOT NULL,
    "messages"   JSONB        NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at" DESC);

COMMIT;
