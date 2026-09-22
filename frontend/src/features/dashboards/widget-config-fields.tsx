import type { ReactNode } from 'react';
import {
  KPI_METRICS,
  RELATIVE_RANGE_LABELS,
  RELATIVE_RANGES,
  SERIES_AGGREGATES,
  SERIES_INTERVALS,
  TREND_INTERVALS,
  type WidgetType,
} from '@gen-ui/shared';
import { MultiSelectFilter, type FilterOption } from '@/components/filters/multi-select-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { Label } from '@/components/ui/label';
import { KPIS } from '@/features/analytics/kpi';
import { AssetSelect } from '@/features/assets/asset-select';
import { TagPicker } from '@/features/tags/tag-picker';
import {
  ALARM_STATE_OPTIONS,
  LOG_SEVERITY_OPTIONS,
  LOGBOOK_CATEGORY_OPTIONS,
  SEVERITY_OPTIONS,
  SHIFT_ROLE_OPTIONS,
} from '@/lib/labels';

export type ConfigDraft = Record<string, unknown>;

const RANGE_OPTIONS: FilterOption<(typeof RELATIVE_RANGES)[number]>[] = RELATIVE_RANGES.map((range) => ({
  value: range,
  label: RELATIVE_RANGE_LABELS[range],
}));
const count = (values: number[]): FilterOption<string>[] => values.map((value) => ({ value: String(value), label: String(value) }));

function Row({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * The settings of one widget type. The fields are the filters of the page the
 * widget previews, so a widget is configured the way that page is filtered.
 */
export function WidgetConfigFields({
  type,
  config,
  onChange,
  errors,
}: {
  type: WidgetType;
  config: ConfigDraft;
  onChange: (config: ConfigDraft) => void;
  errors: Record<string, string>;
}) {
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const text = (key: string) => config[key] as string | undefined;
  const list = <T extends string>(key: string) => config[key] as T[] | undefined;

  const asset = (
    <Row label="Asset" error={errors.assetId}>
      <AssetSelect value={text('assetId')} onChange={(value) => set('assetId', value)} className="w-full" />
    </Row>
  );
  const range = (allowAny: boolean) => (
    <Row label="Time window">
      <SelectFilter
        label="Time window"
        allLabel={allowAny ? 'Any time' : undefined}
        options={RANGE_OPTIONS}
        value={text('range') as (typeof RELATIVE_RANGES)[number] | undefined}
        onChange={(value) => set('range', value)}
        className="w-full"
      />
    </Row>
  );
  const rows = (key: string, max: number) => (
    <Row label="Rows">
      <SelectFilter
        label="Rows"
        options={count(Array.from({ length: max - 2 }, (_, index) => index + 3))}
        value={String(config[key] ?? 5)}
        onChange={(value) => set(key, Number(value ?? 5))}
        className="w-24"
      />
    </Row>
  );

  switch (type) {
    case 'KPI':
      return (
        <>
          <Row label="Figure" error={errors.metric}>
            <SelectFilter
              label="Figure"
              options={KPI_METRICS.map((metric) => ({ value: metric, label: KPIS[metric].label }))}
              value={text('metric') as (typeof KPI_METRICS)[number] | undefined}
              onChange={(value) => set('metric', value)}
              className="w-full"
            />
          </Row>
          {asset}
        </>
      );
    case 'TAG_VALUE':
      return (
        <>
          <Row label="Tag" error={errors.tagId && 'Choose a tag'}>
            <TagPicker
              value={text('tagId') ? [text('tagId')!] : []}
              onChange={(ids) => set('tagId', ids[0] ?? '')}
              max={1}
              placeholder="Choose a tag"
              className="w-full"
            />
          </Row>
          {range(false)}
        </>
      );
    case 'TIME_SERIES':
      return (
        <>
          <Row label="Tags" error={errors.tagIds}>
            <TagPicker value={list('tagIds') ?? []} onChange={(ids) => set('tagIds', ids)} className="w-full" />
          </Row>
          {range(false)}
          <Row label="Buckets">
            <SelectFilter
              label="Bucket size"
              options={[{ value: 'auto', label: 'Automatic' }, ...SERIES_INTERVALS.map((value) => ({ value, label: value }))]}
              value={text('interval') ?? 'auto'}
              onChange={(value) => set('interval', value ?? 'auto')}
              className="w-32"
            />
            <SelectFilter
              label="Aggregate"
              options={SERIES_AGGREGATES.map((value) => ({ value, label: value }))}
              value={text('aggregate') ?? 'avg'}
              onChange={(value) => set('aggregate', value ?? 'avg')}
              className="w-28"
            />
            <SelectFilter
              label="Chart type"
              options={[
                { value: 'line', label: 'Line' },
                { value: 'step', label: 'Step' },
                { value: 'area', label: 'Area' },
                { value: 'bar', label: 'Bar' },
              ]}
              value={text('chartType') ?? 'line'}
              onChange={(value) => set('chartType', value ?? 'line')}
              className="w-28"
            />
          </Row>
        </>
      );
    case 'ALARM_TABLE':
      return (
        <>
          <Row label="Filters">
            <MultiSelectFilter label="State" options={ALARM_STATE_OPTIONS} value={list('state')} onChange={(value) => set('state', value)} />
            <MultiSelectFilter label="Severity" options={SEVERITY_OPTIONS} value={list('severity')} onChange={(value) => set('severity', value)} />
          </Row>
          {asset}
          {range(true)}
          {rows('pageSize', 20)}
        </>
      );
    case 'ALARM_TREND':
      return (
        <>
          {range(false)}
          <Row label="Buckets">
            <SelectFilter
              label="Buckets"
              options={TREND_INTERVALS.map((value) => ({ value, label: `Per ${value}` }))}
              value={text('interval') ?? 'day'}
              onChange={(value) => set('interval', value ?? 'day')}
              className="w-32"
            />
            <MultiSelectFilter label="Severity" options={SEVERITY_OPTIONS} value={list('severity')} onChange={(value) => set('severity', value)} />
          </Row>
          {asset}
        </>
      );
    case 'TOP_ALARMS':
      return (
        <>
          {range(false)}
          <Row label="Rank">
            <SelectFilter
              label="Rank"
              options={[
                { value: 'definition', label: 'Rules' },
                { value: 'asset', label: 'Assets' },
              ]}
              value={text('groupBy') ?? 'definition'}
              onChange={(value) => set('groupBy', value ?? 'definition')}
              className="w-32"
            />
          </Row>
          {asset}
          {rows('limit', 10)}
        </>
      );
    case 'LOGBOOK_FEED':
      return (
        <>
          <Row label="Filters">
            <MultiSelectFilter label="Type" options={LOGBOOK_CATEGORY_OPTIONS} value={list('category')} onChange={(value) => set('category', value)} />
            <MultiSelectFilter label="Severity" options={LOG_SEVERITY_OPTIONS} value={list('severity')} onChange={(value) => set('severity', value)} />
            <SelectFilter
              label="Source"
              allLabel="People and system"
              options={[
                { value: 'user', label: 'People only' },
                { value: 'system', label: 'System only' },
              ]}
              value={text('source') as 'user' | 'system' | undefined}
              onChange={(value) => set('source', value)}
            />
          </Row>
          {asset}
          {rows('pageSize', 20)}
        </>
      );
    case 'DEVICE_STATUS':
      return asset;
    case 'ON_DUTY':
      return (
        <Row label="Roles">
          <MultiSelectFilter label="Role" options={SHIFT_ROLE_OPTIONS} value={list('role')} onChange={(value) => set('role', value)} />
        </Row>
      );
  }
}
