import { SERIES_INTERVAL_MS, type SeriesTag, type TelemetrySeries } from '@gen-ui/shared';
import { seriesColor } from './series-color';

export type SeriesRow = { t: number } & Record<string, number | null>;

export interface UnitGroup {
  unit: string | null;
  tags: Array<SeriesTag & { color: string }>;
  rows: SeriesRow[];
}

/**
 * One group per unit: tags measured in different units never share a y-axis
 * (no dual axes), they get stacked charts on the same time axis instead.
 * A gap in the data breaks the line rather than being bridged by it.
 */
export function groupByUnit(data: TelemetrySeries): UnitGroup[] {
  const intervalMs = SERIES_INTERVAL_MS[data.interval];
  const groups = new Map<string, UnitGroup>();

  data.series.forEach(({ tag }, index) => {
    const key = tag.unit ?? '';
    const group = groups.get(key) ?? { unit: tag.unit, tags: [], rows: [] };
    group.tags.push({ ...tag, color: seriesColor(index) });
    groups.set(key, group);
  });

  for (const group of groups.values()) {
    const rows = new Map<number, SeriesRow>();
    const put = (t: number, tagId: string, v: number | null) => {
      const row = rows.get(t) ?? ({ t } as SeriesRow);
      row[tagId] = v;
      rows.set(t, row);
    };
    for (const { tag, points } of data.series.filter((series) => (series.tag.unit ?? '') === (group.unit ?? ''))) {
      let previous: number | undefined;
      for (const point of points) {
        const t = new Date(point.t).getTime();
        if (previous !== undefined && t - previous > intervalMs * 2.5) put(previous + intervalMs, tag.id, null);
        put(t, tag.id, point.v);
        previous = t;
      }
    }
    group.rows = [...rows.values()].sort((a, b) => a.t - b.t);
  }
  return [...groups.values()];
}

/** A tick formatter suited to the span shown. */
export function timeFormatter(spanMs: number) {
  const format =
    spanMs <= 36 * 3_600_000
      ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
      : spanMs <= 10 * 86_400_000
        ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit' })
        : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return (value: number) => format.format(new Date(value));
}

export const tooltipTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
