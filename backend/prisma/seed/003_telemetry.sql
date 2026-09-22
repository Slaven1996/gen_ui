-- ---------------------------------------------------------------------------
-- 003_telemetry.sql — 14 days of readings, one every 15 minutes per tag
--
-- Values follow the same shape the live simulator produces (a daily rhythm
-- around mid-range, a little noise), so the seeded history and live data join
-- without a seam. Devices that are offline, faulted or in maintenance stop
-- reporting some time ago, which is what their status suggests.
--
-- Re-running tops the series up to the current time: existing readings are
-- kept (ON CONFLICT DO NOTHING on the (tag, time) key), missing ones added.
-- ---------------------------------------------------------------------------

WITH grid AS (
  SELECT date_bin('15 minutes', now(), TIMESTAMPTZ '2000-01-01 00:00:00+00') AS now_slot
),
tag_windows AS (
  SELECT
    t.id,
    t.code,
    t.data_type,
    coalesce(t.min_value, 0) AS min_v,
    coalesce(t.max_value, 100) AS max_v,
    -- A stable phase per tag so the daily curves don't all peak together.
    (('x' || substr(md5(t.id::text), 1, 6))::bit(24)::int % 1000) / 1000.0 AS phase,
    CASE d.status
      WHEN 'OFFLINE' THEN INTERVAL '6 hours'
      WHEN 'MAINTENANCE' THEN INTERVAL '1 day'
      WHEN 'FAULT' THEN INTERVAL '2 days'
      ELSE INTERVAL '0'
    END AS silent_for
  FROM tags t
  JOIN devices d ON d.id = t.device_id
),
slots AS (
  SELECT w.*, s.ts
  FROM tag_windows w
  CROSS JOIN grid g
  CROSS JOIN LATERAL generate_series(g.now_slot - INTERVAL '14 days', g.now_slot - w.silent_for, INTERVAL '15 minutes') AS s(ts)
)
INSERT INTO measurements (tag_id, ts, value, quality)
SELECT
  id,
  ts,
  CASE
    WHEN data_type = 'DIGITAL' AND code LIKE '%RUNNING' THEN
      -- Duty pumps run through the day, standby pumps cover the evening peak.
      CASE WHEN code LIKE 'P2%' THEN (extract(hour FROM ts) BETWEEN 17 AND 21)::int
           ELSE (extract(hour FROM ts) BETWEEN 5 AND 22)::int END
    WHEN data_type = 'DIGITAL' THEN 0
    WHEN data_type = 'COUNTER' THEN
      -- ~180 kWh per hour since a fixed date, so re-runs never make it go backwards.
      round((150000 + extract(epoch FROM ts - TIMESTAMPTZ '2026-01-01 00:00:00+00') / 3600 * 180)::numeric, 1)
    ELSE
      round((min_v + (max_v - min_v) * (
        0.5
        + 0.2 * sin(2 * pi() * (extract(epoch FROM ts) / 86400 + phase))
        + 0.04 * sin(2 * pi() * extract(epoch FROM ts) / 604800)
        + (random() - 0.5) * 0.04
      ))::numeric, 3)
  END,
  'GOOD'::"MeasurementQuality"
FROM slots
ON CONFLICT (tag_id, ts) DO NOTHING;

-- Latest value per tag, and when each device was last heard from.
-- `tags`/`devices` use UTC `timestamp` columns (Prisma's default), hence AT TIME ZONE.
UPDATE tags t
SET last_value = m.value,
    last_value_at = m.ts AT TIME ZONE 'UTC'
FROM (
  SELECT DISTINCT ON (tag_id) tag_id, value, ts
  FROM measurements
  ORDER BY tag_id, ts DESC
) m
WHERE t.id = m.tag_id
  AND (t.last_value_at IS NULL OR t.last_value_at < m.ts AT TIME ZONE 'UTC');

UPDATE devices d
SET last_seen_at = x.last_at
FROM (
  SELECT t.device_id, max(t.last_value_at) AS last_at
  FROM tags t
  GROUP BY t.device_id
) x
WHERE d.id = x.device_id
  AND x.last_at IS NOT NULL
  AND (d.last_seen_at IS NULL OR d.last_seen_at < x.last_at);
