-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('REGION', 'SITE', 'AREA', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'FAULT');

-- CreateEnum
CREATE TYPE "DeviceProtocol" AS ENUM ('MODBUS_TCP', 'OPC_UA', 'MQTT', 'IEC_104', 'DNP3', 'OTHER');

-- CreateEnum
CREATE TYPE "TagDataType" AS ENUM ('ANALOG', 'DIGITAL', 'COUNTER');

-- CreateEnum
CREATE TYPE "MeasurementQuality" AS ENUM ('GOOD', 'UNCERTAIN', 'BAD');

-- CreateEnum
CREATE TYPE "AlarmSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "AlarmCondition" AS ENUM ('ABOVE', 'BELOW', 'EQUAL', 'NOT_EQUAL');

-- CreateEnum
CREATE TYPE "AlarmState" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'CLEARED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LogbookCategory" AS ENUM ('NOTE', 'ALARM', 'DEVICE', 'MAINTENANCE', 'SHIFT');

-- CreateEnum
CREATE TYPE "LogSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('ASSET', 'DEVICE', 'TAG', 'ALARM_DEFINITION', 'ALARM', 'LOGBOOK_ENTRY', 'SHIFT_TEMPLATE', 'SHIFT_ASSIGNMENT', 'DASHBOARD', 'USER');

-- CreateEnum
CREATE TYPE "ShiftRole" AS ENUM ('OPERATOR', 'SUPERVISOR', 'ON_CALL');

-- CreateEnum
CREATE TYPE "WidgetType" AS ENUM ('KPI', 'TAG_VALUE', 'TIME_SERIES', 'ALARM_TABLE', 'ALARM_TREND', 'TOP_ALARMS', 'LOGBOOK_FEED', 'DEVICE_STATUS', 'ON_DUTY');

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "path" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "model" TEXT,
    "manufacturer" TEXT,
    "protocol" "DeviceProtocol" NOT NULL DEFAULT 'MODBUS_TCP',
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "firmware_version" TEXT,
    "ip_address" TEXT,
    "installed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "data_type" "TagDataType" NOT NULL DEFAULT 'ANALOG',
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "log_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "last_value" DOUBLE PRECISION,
    "last_value_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "tag_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "quality" "MeasurementQuality" NOT NULL DEFAULT 'GOOD',

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("tag_id","ts")
);

-- CreateTable
CREATE TABLE "alarm_definitions" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" "AlarmCondition" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "deadband" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severity" "AlarmSeverity" NOT NULL DEFAULT 'MEDIUM',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarm_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "severity" "AlarmSeverity" NOT NULL,
    "state" "AlarmState" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT NOT NULL,
    "trigger_value" DOUBLE PRECISION,
    "clear_value" DOUBLE PRECISION,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" UUID,
    "acknowledge_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_entries" (
    "id" UUID NOT NULL,
    "category" "LogbookCategory" NOT NULL,
    "severity" "LogSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" UUID,
    "alarm_id" UUID,
    "author_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id" UUID,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ShiftRole" NOT NULL DEFAULT 'OPERATOR',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboards" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "type" "WidgetType" NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");

-- CreateIndex
CREATE INDEX "assets_parent_id_idx" ON "assets"("parent_id");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");

-- CreateIndex
CREATE INDEX "devices_asset_id_idx" ON "devices"("asset_id");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tags_device_id_code_key" ON "tags"("device_id", "code");

-- CreateIndex
CREATE INDEX "alarm_definitions_tag_id_idx" ON "alarm_definitions"("tag_id");

-- CreateIndex
CREATE INDEX "alarms_state_severity_idx" ON "alarms"("state", "severity");

-- CreateIndex
CREATE INDEX "alarms_raised_at_idx" ON "alarms"("raised_at");

-- CreateIndex
CREATE INDEX "alarms_asset_id_idx" ON "alarms"("asset_id");

-- CreateIndex
CREATE INDEX "alarms_definition_id_cleared_at_idx" ON "alarms"("definition_id", "cleared_at");

-- CreateIndex
CREATE INDEX "logbook_entries_occurred_at_idx" ON "logbook_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "logbook_entries_category_occurred_at_idx" ON "logbook_entries"("category", "occurred_at");

-- CreateIndex
CREATE INDEX "logbook_entries_asset_id_idx" ON "logbook_entries"("asset_id");

-- CreateIndex
CREATE INDEX "logbook_entries_alarm_id_idx" ON "logbook_entries"("alarm_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_templates_name_key" ON "shift_templates"("name");

-- CreateIndex
CREATE INDEX "shift_assignments_starts_at_ends_at_idx" ON "shift_assignments"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "shift_assignments_user_id_starts_at_idx" ON "shift_assignments"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "dashboards_owner_id_idx" ON "dashboards"("owner_id");

-- CreateIndex
CREATE INDEX "dashboards_is_shared_idx" ON "dashboards"("is_shared");

-- CreateIndex
CREATE INDEX "dashboard_widgets_dashboard_id_position_idx" ON "dashboard_widgets"("dashboard_id", "position");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_definitions" ADD CONSTRAINT "alarm_definitions_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "alarm_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_alarm_id_fkey" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules the Prisma schema language cannot express. Prisma ignores
-- CHECK constraints when diffing, so later migrations leave them alone.
ALTER TABLE "assets" ADD CONSTRAINT "assets_not_own_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_period_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_size_check" CHECK ("width" IN (3, 4, 6, 8, 12) AND "height" BETWEEN 1 AND 3);
