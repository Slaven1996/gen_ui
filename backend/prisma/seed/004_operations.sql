-- ---------------------------------------------------------------------------
-- 004_operations.sql — alarm history, logbook, shift plan, audit trail,
--                      dashboards
--
-- Needs 001 (users), 002 (assets…) and 003 (telemetry).
--
-- Generated rows get deterministic ids from pg_temp.seed_uuid(key), so a
-- re-run finds them and ON CONFLICT DO NOTHING skips them. Times are relative
-- to the first run; re-runs add the shift plan for new days.
--
-- Shifts are planned in SHIFT_TIME_ZONE below (a "06:00" morning shift is
-- 06:00 there). Change it to plan in another zone.
-- ---------------------------------------------------------------------------

-- Deterministic UUID v4 from a key (sets the version and variant nibbles).
CREATE OR REPLACE FUNCTION pg_temp.seed_uuid(key text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT (substr(h, 1, 12) || '4' || substr(h, 14, 3) || '8' || substr(h, 18, 15))::uuid
  FROM (SELECT md5(key) AS h) s
$$;

-- Deterministic pseudo-random integer in [0, modulo).
CREATE OR REPLACE FUNCTION pg_temp.seed_int(key text, modulo int) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || substr(md5(key), 1, 7))::bit(28)::int % modulo
$$;

-- `4.5 m`, `1`, `0.14 mg/L` — readings as the alarm evaluator writes them.
CREATE OR REPLACE FUNCTION pg_temp.reading(v float8, unit text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN r LIKE '%.%' THEN rtrim(rtrim(r, '0'), '.') ELSE r END || coalesce(' ' || unit, '')
  FROM (SELECT round(v::numeric, 2)::text AS r) s
$$;

-- ─── Alarm history ──────────────────────────────────────────────────────────
-- ~90 alarms over two weeks on reporting devices. A few rules fire far more
-- often than the rest, as in any real plant. The most recent four are still
-- open in different states.

WITH operators AS (
  SELECT id, name, row_number() OVER (ORDER BY email) - 1 AS k, count(*) OVER () AS total
  FROM users WHERE is_active
),
defs AS (
  SELECT d.id, d.tag_id, d.name, d.condition, d.threshold, d.deadband, d.severity,
         t.name AS tag_name, t.unit, coalesce(t.min_value, 0) AS min_v, coalesce(t.max_value, 100) AS max_v,
         dev.asset_id, row_number() OVER (ORDER BY d.id) AS k, count(*) OVER () AS n
  FROM alarm_definitions d
  JOIN tags t ON t.id = d.tag_id
  JOIN devices dev ON dev.id = t.device_id
  WHERE d.is_enabled AND dev.status = 'ONLINE'
),
picked AS (
  SELECT
    n,
    CASE n
      WHEN 1 THEN '40000000-0000-4000-8000-000000000010'::uuid -- High turbidity: ACTIVE
      WHEN 2 THEN '40000000-0000-4000-8000-000000000001'::uuid -- Wet well high: ACKNOWLEDGED
      WHEN 3 THEN '40000000-0000-4000-8000-000000000005'::uuid -- Pump 1 fault: CLEARED
      WHEN 4 THEN '40000000-0000-4000-8000-000000000011'::uuid -- Low chlorine: CLEARED
    END AS forced,
    -- Skewed towards the first rules: the "bad actors" of the top-alarms report.
    1 + floor(power(pg_temp.seed_int('def' || n, 10000) / 10000.0, 2.2) * (SELECT max(k) FROM defs))::int AS k,
    (date_bin('15 minutes', now(), TIMESTAMPTZ '2000-01-01 00:00:00+00') AT TIME ZONE 'UTC')
      - make_interval(mins => 15 * (n * 14 + pg_temp.seed_int('jitter' || n, 12))) AS raised_at,
    15 * (1 + pg_temp.seed_int('duration' || n, 10)) AS minutes_active,
    3 + pg_temp.seed_int('ack' || n, 80) AS minutes_to_ack,
    pg_temp.seed_int('who' || n, 1000) AS who
  FROM generate_series(1, 90) AS n
),
occurrences AS (
  SELECT
    p.n, p.raised_at, p.minutes_active, p.minutes_to_ack, p.who,
    d.id AS definition_id, d.tag_id, d.asset_id, d.name, d.condition, d.threshold, d.severity,
    d.tag_name, d.unit,
    CASE d.condition
      WHEN 'ABOVE' THEN d.threshold + (d.max_v - d.min_v) * 0.03
      WHEN 'BELOW' THEN d.threshold - (d.max_v - d.min_v) * 0.03
      ELSE d.threshold
    END AS trigger_value,
    CASE d.condition
      WHEN 'ABOVE' THEN d.threshold - d.deadband - (d.max_v - d.min_v) * 0.05
      WHEN 'BELOW' THEN d.threshold + d.deadband + (d.max_v - d.min_v) * 0.05
      WHEN 'EQUAL' THEN 1 - d.threshold
      ELSE d.threshold
    END AS clear_value
  FROM picked p
  JOIN defs d ON d.id = coalesce(p.forced, (SELECT id FROM defs WHERE defs.k = p.k))
)
INSERT INTO alarms (
  id, definition_id, tag_id, asset_id, severity, state, message, trigger_value, clear_value,
  raised_at, cleared_at, acknowledged_at, acknowledged_by_id, acknowledge_note, updated_at
)
SELECT
  pg_temp.seed_uuid('alarm-' || o.n),
  o.definition_id, o.tag_id, o.asset_id, o.severity,
  (CASE o.n WHEN 1 THEN 'ACTIVE' WHEN 2 THEN 'ACKNOWLEDGED' WHEN 3 THEN 'CLEARED' WHEN 4 THEN 'CLEARED' ELSE 'CLOSED' END)::"AlarmState",
  o.name || ': ' || o.tag_name || ' '
    || CASE o.condition WHEN 'ABOVE' THEN 'above' WHEN 'BELOW' THEN 'below' WHEN 'EQUAL' THEN 'equal to' ELSE 'not equal to' END
    || ' ' || pg_temp.reading(o.threshold, o.unit) || ' (' || pg_temp.reading(o.trigger_value, o.unit) || ')',
  o.trigger_value,
  CASE WHEN o.n IN (1, 2) THEN NULL ELSE o.clear_value END,
  o.raised_at,
  CASE WHEN o.n IN (1, 2) THEN NULL ELSE o.raised_at + make_interval(mins => o.minutes_active) END,
  CASE WHEN o.n IN (1, 3, 4) THEN NULL ELSE o.raised_at + make_interval(mins => o.minutes_to_ack) END,
  CASE WHEN o.n IN (1, 3, 4) THEN NULL ELSE (SELECT id FROM operators WHERE k = o.who % operators.total) END,
  CASE WHEN o.n IN (1, 3, 4) THEN NULL
       ELSE (ARRAY['Crew dispatched', 'Known issue, monitoring', NULL, 'Reset locally', NULL, NULL])[1 + o.who % 6] END,
  now()
FROM occurrences o
ON CONFLICT (id) DO NOTHING;

-- Two alarms on devices that stopped reporting, so nothing will clear them.
INSERT INTO alarms (
  id, definition_id, tag_id, asset_id, severity, state, message, trigger_value,
  raised_at, acknowledged_at, acknowledged_by_id, acknowledge_note, updated_at
)
VALUES
  (pg_temp.seed_uuid('alarm-bridge-strain'), '40000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000030',
   '10000000-0000-4000-8000-000000000008', 'CRITICAL', 'ACKNOWLEDGED',
   'Deck strain limit: Deck strain above 450 µε (468 µε)', 468,
   (now() AT TIME ZONE 'UTC') - INTERVAL '7 hours', (now() AT TIME ZONE 'UTC') - INTERVAL '6 hours 40 minutes',
   (SELECT id FROM users WHERE email = 'noah.bennett@example.com'),
   'Traffic police informed; heavy vehicles diverted. Unit lost comms right after.', now()),
  (pg_temp.seed_uuid('alarm-tank1-level'), '40000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000032',
   '10000000-0000-4000-8000-000000000013', 'CRITICAL', 'ACTIVE',
   'Tank 1 high level: Tank 1 level above 5.5 m (5.71 m)', 5.71,
   (now() AT TIME ZONE 'UTC') - INTERVAL '2 days 1 hour', NULL, NULL, NULL, now())
ON CONFLICT (id) DO NOTHING;

-- The alarms this file owns. Timeline and audit rows below are generated for
-- these only: alarms raised live already wrote their own.
CREATE TEMP TABLE seeded_alarms ON COMMIT DROP AS
SELECT pg_temp.seed_uuid('alarm-' || n) AS id FROM generate_series(1, 90) AS n
UNION ALL SELECT pg_temp.seed_uuid('alarm-bridge-strain')
UNION ALL SELECT pg_temp.seed_uuid('alarm-tank1-level');

-- Make the charts agree with the history: the readings of each seeded alarm's
-- active period sit on the value that tripped it.
UPDATE measurements m
SET value = a.trigger_value
FROM alarms a
WHERE a.id IN (SELECT id FROM seeded_alarms)
  AND m.tag_id = a.tag_id
  AND m.ts >= a.raised_at AT TIME ZONE 'UTC'
  AND m.ts < coalesce(a.cleared_at, a.raised_at + INTERVAL '15 minutes') AT TIME ZONE 'UTC';

-- ─── Logbook: the timeline of every seeded alarm ────────────────────────────

INSERT INTO logbook_entries (id, category, severity, title, body, occurred_at, asset_id, alarm_id, author_id, updated_at)
SELECT pg_temp.seed_uuid('log-raised-' || a.id), 'ALARM',
       (CASE a.severity WHEN 'CRITICAL' THEN 'CRITICAL' WHEN 'HIGH' THEN 'CRITICAL'
                        WHEN 'MEDIUM' THEN 'WARNING' WHEN 'LOW' THEN 'WARNING' ELSE 'INFO' END)::"LogSeverity",
       'Alarm raised: ' || d.name, a.message, a.raised_at, a.asset_id, a.id, NULL, now()
FROM alarms a JOIN alarm_definitions d ON d.id = a.definition_id
WHERE a.id IN (SELECT id FROM seeded_alarms)
ON CONFLICT (id) DO NOTHING;

INSERT INTO logbook_entries (id, category, severity, title, body, occurred_at, asset_id, alarm_id, author_id, updated_at)
SELECT pg_temp.seed_uuid('log-ack-' || a.id), 'ALARM', 'INFO',
       'Alarm acknowledged: ' || d.name,
       'Acknowledged by ' || u.name || coalesce(': ' || a.acknowledge_note, '.'),
       a.acknowledged_at, a.asset_id, a.id, NULL, now()
FROM alarms a
JOIN alarm_definitions d ON d.id = a.definition_id
JOIN users u ON u.id = a.acknowledged_by_id
WHERE a.acknowledged_at IS NOT NULL AND a.id IN (SELECT id FROM seeded_alarms)
ON CONFLICT (id) DO NOTHING;

INSERT INTO logbook_entries (id, category, severity, title, body, occurred_at, asset_id, alarm_id, author_id, updated_at)
SELECT pg_temp.seed_uuid('log-cleared-' || a.id), 'ALARM', 'INFO',
       'Alarm cleared: ' || d.name,
       t.name || ' back to ' || pg_temp.reading(a.clear_value, t.unit) || '.',
       a.cleared_at, a.asset_id, a.id, NULL, now()
FROM alarms a
JOIN alarm_definitions d ON d.id = a.definition_id
JOIN tags t ON t.id = a.tag_id
WHERE a.cleared_at IS NOT NULL AND a.clear_value IS NOT NULL AND a.id IN (SELECT id FROM seeded_alarms)
ON CONFLICT (id) DO NOTHING;

-- ─── Logbook: what people wrote ─────────────────────────────────────────────

INSERT INTO logbook_entries (id, category, severity, title, body, occurred_at, asset_id, author_id, updated_at)
SELECT pg_temp.seed_uuid('note-' || v.k), v.category::"LogbookCategory", v.severity::"LogSeverity", v.title, v.body,
       (now() AT TIME ZONE 'UTC') - v.ago, v.asset_id::uuid, (SELECT id FROM users WHERE email = v.email), now()
FROM (VALUES
  (1, 'SHIFT', 'INFO', 'Handover: night to morning',
   'Quiet night. Pump 2 on standby, reservoir at 4.1 m. Chlorine analyser flushed at 04:30.',
   INTERVAL '3 hours', NULL, 'liam.carter@example.com'),
  (2, 'NOTE', 'WARNING', 'Turbidity creeping up at Northgate',
   'Up since the rain this morning. Operations asked to watch the filters; lab sample taken.',
   INTERVAL '4 hours', '10000000-0000-4000-8000-000000000005', 'sofia.reyes@example.com'),
  (3, 'MAINTENANCE', 'INFO', 'Lift pump 1 pulled for inspection',
   'Impeller wear suspected. Controller set to maintenance; PS-02 running on the bypass until tomorrow.',
   INTERVAL '1 day', '10000000-0000-4000-8000-000000000012', 'noah.bennett@example.com'),
  (4, 'NOTE', 'CRITICAL', 'Bridge monitoring unit not reporting',
   'No data from BMU-001 since the strain alarm. Field visit booked; assume the last reading holds.',
   INTERVAL '5 hours', '10000000-0000-4000-8000-000000000008', 'noah.bennett@example.com'),
  (5, 'MAINTENANCE', 'WARNING', 'Tank 1 radar sensor faulty',
   'Reading stuck high. Dosing switched to manual; replacement sensor ordered.',
   INTERVAL '1 day 20 hours', '10000000-0000-4000-8000-000000000013', 'ava.mitchell@example.com'),
  (6, 'SHIFT', 'INFO', 'Handover: afternoon to night',
   'Wet well high level acknowledged, level falling. No open work orders.',
   INTERVAL '11 hours', NULL, 'sofia.reyes@example.com'),
  (7, 'NOTE', 'INFO', 'Storm warning for the weekend',
   'Met office expects 40+ mm/h bursts. PS-02 on-call to check the overflow screens beforehand.',
   INTERVAL '2 days 6 hours', '10000000-0000-4000-8000-000000000007', 'ava.mitchell@example.com'),
  (8, 'MAINTENANCE', 'INFO', 'Pump 1 drive firmware updated',
   'ACS880 to 3.1.0; no parameter changes. Test run OK.',
   INTERVAL '4 days 2 hours', '10000000-0000-4000-8000-000000000010', 'liam.carter@example.com'),
  (9, 'SHIFT', 'INFO', 'Handover: morning to afternoon',
   'Reservoir refill finished. Pump 1 fault earlier was a false trip; reset locally.',
   INTERVAL '3 days 8 hours', NULL, 'liam.carter@example.com'),
  (10, 'NOTE', 'INFO', 'Chlorine dosing set point raised',
   'From 0.8 to 0.9 mg/L at the treatment works after the low-residual alarms last week.',
   INTERVAL '6 days', '10000000-0000-4000-8000-000000000005', 'ava.mitchell@example.com'),
  (11, 'MAINTENANCE', 'INFO', 'Reservoir level transmitter calibrated',
   'Two-point check against the staff gauge, within 1 cm.',
   INTERVAL '8 days', '10000000-0000-4000-8000-000000000004', 'noah.bennett@example.com'),
  (12, 'SHIFT', 'INFO', 'Handover: night to morning',
   'Intrusion alarm at PS-01 at 02:10 was the security patrol. Nothing else to report.',
   INTERVAL '9 days 3 hours', NULL, 'sofia.reyes@example.com'),
  (13, 'NOTE', 'WARNING', 'Harbor station wet well rising during tides',
   'High water pushes infiltration up; expect more PS-02 high level alarms around spring tide.',
   INTERVAL '11 days', '10000000-0000-4000-8000-000000000006', 'liam.carter@example.com'),
  (14, 'MAINTENANCE', 'INFO', 'Weather logger batteries replaced',
   NULL,
   INTERVAL '13 days', '10000000-0000-4000-8000-000000000007', 'noah.bennett@example.com')
) AS v(k, category, severity, title, body, ago, asset_id, email)
ON CONFLICT (id) DO NOTHING;

-- ─── Shift plan ─────────────────────────────────────────────────────────────
-- Three operators rotate weekly through morning, afternoon and night; Ava
-- supervises weekday mornings; the admin covers weekend on-call.
-- From a week back to three weeks ahead of whenever the seed runs, in the
-- plant time zone (SHIFT_TIME_ZONE, which seed.ts hands over as a setting).
-- Each person's week on one shift is a series. The night operator nine days
-- ahead is left out, so the calendar has a staffing gap to show.

WITH params AS (
  SELECT COALESCE(NULLIF(current_setting('app.shift_time_zone', true), ''), 'Europe/Budapest') AS tz
),
days AS (
  SELECT d::date AS day
  FROM params, generate_series((now() AT TIME ZONE tz)::date - 7, (now() AT TIME ZONE tz)::date + 21, INTERVAL '1 day') AS d
),
crew AS (
  SELECT id, row_number() OVER (ORDER BY email) - 1 AS k
  FROM users
  WHERE email IN ('liam.carter@example.com', 'sofia.reyes@example.com', 'noah.bennett@example.com')
),
plan AS (
  -- Operators, every day.
  SELECT days.day, t.id AS template_id, c.id AS user_id, 'OPERATOR' AS role
  FROM days
  CROSS JOIN (VALUES
    ('50000000-0000-4000-8000-000000000001'::uuid, 0),
    ('50000000-0000-4000-8000-000000000002'::uuid, 1),
    ('50000000-0000-4000-8000-000000000003'::uuid, 2)
  ) AS slot(template_id, idx)
  JOIN shift_templates t ON t.id = slot.template_id
  JOIN crew c ON c.k = (slot.idx + extract(week FROM days.day)::int) % 3
  UNION ALL
  -- Supervisor, weekday mornings.
  SELECT days.day, '50000000-0000-4000-8000-000000000001', u.id, 'SUPERVISOR'
  FROM days JOIN users u ON u.email = 'ava.mitchell@example.com'
  WHERE extract(isodow FROM days.day) BETWEEN 1 AND 5
  UNION ALL
  -- On-call, weekends.
  SELECT days.day, '50000000-0000-4000-8000-000000000004', u.id, 'ON_CALL'
  FROM days JOIN users u ON u.email = 'admin@example.com'
  WHERE extract(isodow FROM days.day) IN (6, 7)
)
INSERT INTO shift_assignments (id, series_id, template_id, user_id, role, starts_at, ends_at, notes, created_by_id, updated_at)
SELECT
  pg_temp.seed_uuid('shift-' || p.day || '-' || p.template_id || '-' || p.user_id),
  pg_temp.seed_uuid('series-' || p.template_id || '-' || p.user_id || '-' || p.role || '-'
    || extract(isoyear FROM p.day) || '-' || extract(week FROM p.day)),
  p.template_id, p.user_id, p.role::"ShiftRole",
  -- Local wall-clock start and end in the plan's zone, stored as UTC. The end
  -- is wall-clock too: a night shift ends at 06:00 even when the clocks change.
  ((p.day + t.start_time::time) AT TIME ZONE params.tz) AT TIME ZONE 'UTC',
  ((p.day + t.start_time::time + make_interval(mins => t.duration_minutes)) AT TIME ZONE params.tz) AT TIME ZONE 'UTC',
  NULL,
  (SELECT id FROM users WHERE email = 'admin@example.com'),
  now()
FROM plan p
JOIN shift_templates t ON t.id = p.template_id
CROSS JOIN params
WHERE NOT (p.template_id = '50000000-0000-4000-8000-000000000003' AND p.role = 'OPERATOR'
           AND p.day = (now() AT TIME ZONE params.tz)::date + 9)
-- No conflict target: besides re-runs (same id), this also skips a seeded
-- shift that would overlap one somebody scheduled by hand since.
ON CONFLICT DO NOTHING;

-- ─── Audit trail ────────────────────────────────────────────────────────────
-- The configuration work that set the plant up, then every acknowledgement.

INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, changes, created_at)
SELECT pg_temp.seed_uuid('audit-setup-' || v.k), (SELECT id FROM users WHERE email = v.email), v.action,
       v.entity_type::"AuditEntityType", v.entity_id::uuid, v.summary, v.changes::jsonb,
       (now() AT TIME ZONE 'UTC') - v.ago
FROM (VALUES
  (1, 'admin@example.com', 'asset.create', 'ASSET', '10000000-0000-4000-8000-000000000003',
   'Created site Riverside Pumping Station (PS-01)', '{"code": "PS-01", "type": "SITE"}', INTERVAL '20 days'),
  (2, 'admin@example.com', 'device.create', 'DEVICE', '20000000-0000-4000-8000-000000000001',
   'Added device PS-01 RTU (RTU-PS01-001) to Riverside Pumping Station', '{"protocol": "MODBUS_TCP"}', INTERVAL '20 days'),
  (3, 'ava.mitchell@example.com', 'alarm_definition.create', 'ALARM_DEFINITION', '40000000-0000-4000-8000-000000000011',
   'Created alarm rule “Low chlorine residual” on Free chlorine', '{"condition": "BELOW", "threshold": 0.2, "severity": "CRITICAL"}', INTERVAL '19 days'),
  (4, 'ava.mitchell@example.com', 'alarm_definition.update', 'ALARM_DEFINITION', '40000000-0000-4000-8000-000000000001',
   'Updated alarm rule “Wet well high level”', '{"threshold": {"from": 4.2, "to": 4.5}, "deadband": {"from": 0, "to": 0.2}}', INTERVAL '10 days'),
  (5, 'ava.mitchell@example.com', 'alarm_definition.update', 'ALARM_DEFINITION', '40000000-0000-4000-8000-000000000018',
   'Updated alarm rule “Water temperature high”', '{"isEnabled": {"from": true, "to": false}}', INTERVAL '9 days'),
  (6, 'noah.bennett@example.com', 'device.update', 'DEVICE', '20000000-0000-4000-8000-000000000007',
   'Updated device Lift pump 1 controller (PC-PS02-P1)', '{"status": {"from": "ONLINE", "to": "MAINTENANCE"}}', INTERVAL '1 day'),
  (7, 'admin@example.com', 'shift_template.create', 'SHIFT_TEMPLATE', '50000000-0000-4000-8000-000000000004',
   'Created shift “Weekend on-call” (08:00, 12 h)', NULL, INTERVAL '18 days')
) AS v(k, email, action, entity_type, entity_id, summary, changes, ago)
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, changes, created_at)
SELECT pg_temp.seed_uuid('audit-ack-' || a.id), a.acknowledged_by_id, 'alarm.acknowledge', 'ALARM', a.id,
       'Acknowledged “' || a.message || '”',
       jsonb_build_object('state', jsonb_build_object('from', 'ACTIVE', 'to', 'ACKNOWLEDGED'))
         || CASE WHEN a.acknowledge_note IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', a.acknowledge_note) END,
       a.acknowledged_at
FROM alarms a
WHERE a.acknowledged_at IS NOT NULL AND a.acknowledged_by_id IS NOT NULL AND a.id IN (SELECT id FROM seeded_alarms)
ON CONFLICT (id) DO NOTHING;

-- ─── Dashboards ─────────────────────────────────────────────────────────────
-- A shared operations overview (admin) and a personal one (Liam).
-- Widget configs match WIDGET_CONFIG_SCHEMAS in @gen-ui/shared.

INSERT INTO dashboards (id, owner_id, name, is_shared, updated_at)
VALUES
  ('60000000-0000-4000-8000-000000000001', (SELECT id FROM users WHERE email = 'admin@example.com'),
   'Operations overview', true, now()),
  ('60000000-0000-4000-8000-000000000002', (SELECT id FROM users WHERE email = 'liam.carter@example.com'),
   'Riverside pumps', false, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO dashboard_widgets (id, dashboard_id, type, title, position, width, height, config, updated_at)
VALUES
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'KPI', 'Open alarms', 0, 3, 1,
   '{"metric": "OPEN_ALARMS"}', now()),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'KPI', 'Unacknowledged', 1, 3, 1,
   '{"metric": "UNACKNOWLEDGED_ALARMS"}', now()),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', 'KPI', 'Devices offline', 2, 3, 1,
   '{"metric": "DEVICES_OFFLINE"}', now()),
  ('61000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001', 'KPI', 'Mean time to acknowledge', 3, 3, 1,
   '{"metric": "MTTA"}', now()),
  ('61000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000001', 'ALARM_TABLE', 'Alarms needing attention', 4, 8, 2,
   '{"state": ["ACTIVE", "ACKNOWLEDGED", "CLEARED"], "pageSize": 6}', now()),
  ('61000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000001', 'ON_DUTY', 'On duty now', 5, 4, 2,
   '{}', now()),
  ('61000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000001', 'TIME_SERIES', 'Reservoir and wet well levels', 6, 8, 2,
   '{"tagIds": ["30000000-0000-4000-8000-000000000015", "30000000-0000-4000-8000-000000000004"], "range": "24h", "interval": "auto", "aggregate": "avg", "chartType": "line"}', now()),
  ('61000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000001', 'TAG_VALUE', 'Free chlorine', 7, 4, 1,
   '{"tagId": "30000000-0000-4000-8000-000000000019", "range": "24h"}', now()),
  ('61000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000001', 'TAG_VALUE', 'Turbidity', 8, 4, 1,
   '{"tagId": "30000000-0000-4000-8000-000000000018", "range": "24h"}', now()),
  ('61000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000001', 'ALARM_TREND', 'Alarms per day', 9, 6, 2,
   '{"range": "7d", "interval": "day"}', now()),
  ('61000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000001', 'TOP_ALARMS', 'Most frequent alarms', 10, 6, 2,
   '{"range": "30d", "groupBy": "definition", "limit": 5}', now()),
  ('61000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000001', 'DEVICE_STATUS', 'Device status', 11, 4, 2,
   '{}', now()),
  ('61000000-0000-4000-8000-000000000013', '60000000-0000-4000-8000-000000000001', 'LOGBOOK_FEED', 'Latest in the logbook', 12, 8, 2,
   '{"pageSize": 6}', now()),

  ('61000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000002', 'TIME_SERIES', 'Pump motor currents', 0, 8, 2,
   '{"tagIds": ["30000000-0000-4000-8000-000000000009", "30000000-0000-4000-8000-000000000013"], "range": "24h", "interval": "auto", "aggregate": "max", "chartType": "line"}', now()),
  ('61000000-0000-4000-8000-000000000022', '60000000-0000-4000-8000-000000000002', 'TAG_VALUE', 'Wet well level', 1, 4, 1,
   '{"tagId": "30000000-0000-4000-8000-000000000004", "range": "24h"}', now()),
  ('61000000-0000-4000-8000-000000000023', '60000000-0000-4000-8000-000000000002', 'TAG_VALUE', 'Discharge flow', 2, 4, 1,
   '{"tagId": "30000000-0000-4000-8000-000000000003", "range": "24h"}', now()),
  ('61000000-0000-4000-8000-000000000024', '60000000-0000-4000-8000-000000000002', 'ALARM_TABLE', 'PS-01 alarms, last 7 days', 3, 12, 2,
   '{"assetId": "10000000-0000-4000-8000-000000000003", "range": "7d", "pageSize": 5}', now())
ON CONFLICT (id) DO NOTHING;
