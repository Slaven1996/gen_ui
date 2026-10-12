import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { OPEN_ALARM_STATES } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { DetailHeader } from '@/components/detail/detail-header';
import { DetailLink } from '@/components/detail/detail-link';
import { DetailList } from '@/components/detail/detail-list';
import { DetailLoader } from '@/components/detail/detail-loader';
import { DetailRow } from '@/components/detail/detail-row';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { formatDateTime, formatReading } from '@/lib/format';
import { ALARM_CONDITION } from '@/lib/labels';
import { alarmDefinitionQueryOptions } from '../api/queries';
import { useDefinitionActions } from '../hooks/use-definition-actions';

/**
 * One alarm rule with its full description and its alarms. The body of the
 * rules table's detail sheet and of the assistant's rule card; `action` is
 * the card's "Open in new tab". Admins can switch it on or off and edit it
 * here (the same dialog as the row menu); deleting stays in the row menu.
 */
export function DefinitionDetail({ definitionId, action }: { definitionId: string; action?: ReactNode }) {
  const definition = useQuery({ ...alarmDefinitionQueryOptions(definitionId), refetchInterval: LIVE_REFRESH_MS });
  const { actions, dialogs } = useDefinitionActions();

  return (
    <>
      <DetailLoader query={definition} title="Alarm rule" action={action}>
        {(data) => {
          const condition = ALARM_CONDITION[data.condition];
          return (
            <>
              <DetailHeader
                title={data.name}
                description={`${data.tag.name} ${condition.symbol} ${formatReading(data.threshold, data.tag.unit)}`}
                badges={
                  <>
                    <SeverityBadge severity={data.severity} />
                    <StatusBadge tone={data.isEnabled ? 'good' : 'neutral'} label={data.isEnabled ? 'Enabled' : 'Disabled'} />
                  </>
                }
                action={action}
              />

              <div className="space-y-5 px-4 pb-6">
                {actions && (
                  <div className="flex flex-wrap items-center gap-4">
                    <Button variant="outline" onClick={() => actions.onEdit(data)}>
                      <Pencil />
                      Edit
                    </Button>
                    <Label className="font-normal">
                      <Switch checked={data.isEnabled} onCheckedChange={(checked) => actions.onToggle(data, checked)} />
                      Evaluated
                    </Label>
                  </div>
                )}

                <DetailList>
                  <DetailRow label="Description">{data.description ?? '—'}</DetailRow>
                  <DetailRow label="Tag">
                    <DetailLink to="/tags" search={{ tag: data.tag.id }}>
                      {data.tag.name}
                    </DetailLink>
                    <div className="text-muted-foreground">{data.tag.code}</div>
                  </DetailRow>
                  <DetailRow label="Asset">
                    <AssetLink asset={data.asset} />
                  </DetailRow>
                  <DetailRow label="Condition">
                    {condition.label} {formatReading(data.threshold, data.tag.unit)}
                  </DetailRow>
                  <DetailRow label="Deadband">
                    {data.deadband > 0 ? formatReading(data.deadband, data.tag.unit) : 'None'}
                  </DetailRow>
                  <DetailRow label="Open alarms">
                    {data.openAlarmCount > 0 ? (
                      <DetailLink to="/alarms" search={{ definitionId: [data.id], state: [...OPEN_ALARM_STATES] }}>
                        {data.openAlarmCount} open
                      </DetailLink>
                    ) : (
                      'None'
                    )}
                  </DetailRow>
                  <DetailRow label="History">
                    <DetailLink to="/alarms" search={{ definitionId: [data.id] }}>
                      All its alarms
                    </DetailLink>
                  </DetailRow>
                  <DetailRow label="Created">{formatDateTime(data.createdAt)}</DetailRow>
                  <DetailRow label="Last changed">{formatDateTime(data.updatedAt)}</DetailRow>
                </DetailList>
              </div>
            </>
          );
        }}
      </DetailLoader>
      {dialogs}
    </>
  );
}
