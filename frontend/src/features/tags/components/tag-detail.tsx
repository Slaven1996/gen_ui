import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellPlus, LineChart, Pencil } from 'lucide-react';
import { OPEN_ALARM_STATES, type Tag } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { DetailHeader } from '@/components/detail/detail-header';
import { DetailLink } from '@/components/detail/detail-link';
import { DetailList } from '@/components/detail/detail-list';
import { DetailLoader } from '@/components/detail/detail-loader';
import { DetailRow } from '@/components/detail/detail-row';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { alarmDefinitionsListQueryOptions, alarmsListQueryOptions } from '@/features/alarms/api/queries';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { formatDateTime, formatNumber, formatReading, formatRelative, plural } from '@/lib/format';
import { TAG_DATA_TYPE } from '@/lib/labels';
import { tagQueryOptions } from '../api/queries';
import { useTagActions } from '../hooks/use-tag-actions';
import { TagValue } from './tag-value';

/** The expected range, open-ended on a side without a limit. */
function rangeOf({ minValue, maxValue, unit }: Pick<Tag, 'minValue' | 'maxValue' | 'unit'>): string {
  if (minValue !== null && maxValue !== null) return `${formatNumber(minValue)} – ${formatReading(maxValue, unit)}`;
  if (minValue !== null) return `from ${formatReading(minValue, unit)}`;
  if (maxValue !== null) return `up to ${formatReading(maxValue, unit)}`;
  return '—';
}

/**
 * One tag with its live value and everything the table leaves out. The body
 * of the tags table's detail sheet and of the assistant's tag card; `action`
 * is the card's "Open in new tab". Everyone can chart it; admins can also add
 * an alarm rule and edit it here (the same dialogs as the row menu).
 */
export function TagDetail({ tagId, action }: { tagId: string; action?: ReactNode }) {
  const tag = useQuery({ ...tagQueryOptions(tagId), refetchInterval: LIVE_REFRESH_MS });
  const rules = useQuery(alarmDefinitionsListQueryOptions({ tagId, pageSize: 1 }));
  const openAlarms = useQuery(alarmsListQueryOptions({ tagId, state: [...OPEN_ALARM_STATES], pageSize: 1 }));
  const { actions, dialogs } = useTagActions(true);

  return (
    <>
      <DetailLoader query={tag} title="Tag" action={action}>
        {(data) => (
          <>
            <DetailHeader
              title={data.name}
              description={data.code}
              badges={<StatusBadge tone={data.isActive ? 'good' : 'neutral'} label={data.isActive ? 'Active' : 'Inactive'} />}
              action={action}
            />

            <div className="space-y-5 px-4 pb-6">
              {actions && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => actions.onChart(data)}>
                    <LineChart />
                    Chart
                  </Button>
                  {actions.onAddRule && (
                    <Button variant="outline" onClick={() => actions.onAddRule?.(data)}>
                      <BellPlus />
                      Add alarm rule
                    </Button>
                  )}
                  {actions.onEdit && (
                    <Button variant="outline" onClick={() => actions.onEdit?.(data)}>
                      <Pencil />
                      Edit
                    </Button>
                  )}
                </div>
              )}

              <DetailList>
                <DetailRow label="Current value">
                  <span className="tabular-nums">
                    <TagValue tag={data} />
                  </span>
                  {data.lastValueAt && <span className="text-muted-foreground"> · {formatRelative(data.lastValueAt)}</span>}
                </DetailRow>
                <DetailRow label="Description">{data.description ?? '—'}</DetailRow>
                <DetailRow label="Type">{TAG_DATA_TYPE[data.dataType]}</DetailRow>
                <DetailRow label="Unit">{data.unit ?? '—'}</DetailRow>
                <DetailRow label="Range">{rangeOf(data)}</DetailRow>
                <DetailRow label="Logged every">{plural(data.logIntervalSeconds, 'second')}</DetailRow>
                <DetailRow label="Device">
                  <DetailLink to="/devices" search={{ device: data.device.id }}>
                    {data.device.name}
                  </DetailLink>
                  <div className="text-muted-foreground">{data.device.serialNumber}</div>
                </DetailRow>
                <DetailRow label="Asset">
                  <AssetLink asset={data.asset} />
                </DetailRow>
                <DetailRow label="Alarm rules">
                  {rules.data ? (
                    rules.data.total > 0 ? (
                      <DetailLink to="/alarm-rules" search={{ tagId: data.id }}>
                        {plural(rules.data.total, 'rule')}
                      </DetailLink>
                    ) : (
                      'None'
                    )
                  ) : (
                    '…'
                  )}
                </DetailRow>
                <DetailRow label="Open alarms">
                  {openAlarms.data ? (
                    openAlarms.data.total > 0 ? (
                      <DetailLink to="/alarms" search={{ tagId: data.id, state: [...OPEN_ALARM_STATES] }}>
                        {openAlarms.data.total} open
                      </DetailLink>
                    ) : (
                      'None'
                    )
                  ) : (
                    '…'
                  )}
                </DetailRow>
                <DetailRow label="Created">{formatDateTime(data.createdAt)}</DetailRow>
                <DetailRow label="Last changed">{formatDateTime(data.updatedAt)}</DetailRow>
              </DetailList>
            </div>
          </>
        )}
      </DetailLoader>
      {dialogs}
    </>
  );
}
