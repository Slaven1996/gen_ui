import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LineChart } from 'lucide-react';
import type { Alarm } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { AlarmStateBadge } from '@/components/badges/alarm-state-badge';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { DetailHeader } from '@/components/detail/detail-header';
import { DetailList } from '@/components/detail/detail-list';
import { DetailLoader } from '@/components/detail/detail-loader';
import { DetailRow } from '@/components/detail/detail-row';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSaveLogbookEntry } from '@/features/logbook/api/mutations';
import { logbookListQueryOptions } from '@/features/logbook/api/queries';
import { LogbookTimeline } from '@/features/logbook/components/logbook-timeline';
import { useAuth } from '@/lib/auth/auth-store';
import { formatDateTime, formatReading } from '@/lib/format';
import { ALARM_CONDITION } from '@/lib/labels';
import { useClearAlarm } from '../api/mutations';
import { alarmQueryOptions } from '../api/queries';
import { canAcknowledge } from '../lib/alarm-state';
import { AcknowledgeDialog } from './acknowledge-dialog';

const HOUR = 3_600_000;

/**
 * A chart window around the alarm: from a few hours before it tripped to a
 * few hours after it cleared (or now), as a `/graphs` link.
 */
function chartWindow(alarm: Alarm) {
  const from = new Date(new Date(alarm.raisedAt).getTime() - 6 * HOUR);
  const end = alarm.clearedAt ? new Date(new Date(alarm.clearedAt).getTime() + 6 * HOUR) : new Date();
  return {
    tagIds: [alarm.tag.id],
    from: from.toISOString(),
    ...(end.getTime() < Date.now() && { to: end.toISOString() }),
  };
}

/**
 * One alarm: its actions, chart link and timeline. The body of the alarm
 * tables' detail sheet and of the assistant's alarm card; `action` is the
 * card's "Open in new tab".
 */
export function AlarmDetail({ alarmId, action }: { alarmId: string; action?: ReactNode }) {
  const { user } = useAuth();
  const alarm = useQuery(alarmQueryOptions(alarmId));
  const timeline = useQuery(logbookListQueryOptions({ alarmId, sort: 'occurredAt', pageSize: 100 }));
  const clear = useClearAlarm();
  const addNote = useSaveLogbookEntry();
  const [acknowledging, setAcknowledging] = useState(false);
  const [note, setNote] = useState('');

  return (
    <DetailLoader query={alarm} title="Alarm" action={action}>
      {(data) => {
        const condition = ALARM_CONDITION[data.definition.condition];
        const conditionPresent = data.state === 'ACTIVE' || data.state === 'ACKNOWLEDGED';
        return (
          <>
            <DetailHeader
              title={data.definition.name}
              description={data.message}
              badges={
                <>
                  <SeverityBadge severity={data.severity} />
                  <AlarmStateBadge state={data.state} />
                </>
              }
              action={action}
            />

            <div className="space-y-5 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                {canAcknowledge(data) && <Button onClick={() => setAcknowledging(true)}>Acknowledge</Button>}
                {user?.role === 'ADMIN' && conditionPresent && (
                  <Button variant="outline" onClick={() => clear.mutate(data.id)} disabled={clear.isPending}>
                    Clear by hand
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/graphs" search={chartWindow(data)}>
                    <LineChart />
                    Chart {data.tag.name}
                  </Link>
                </Button>
              </div>

              <DetailList>
                <DetailRow label="Rule">
                  <Link to="/alarm-rules" search={{ rule: data.definition.id }} className="hover:underline">
                    {data.tag.name} {condition.symbol} {formatReading(data.definition.threshold, data.tag.unit)}
                  </Link>
                </DetailRow>
                <DetailRow label="Tag">
                  <Link to="/tags" search={{ tag: data.tag.id }} className="hover:underline">
                    {data.tag.name}
                  </Link>
                  <span className="text-muted-foreground"> · {data.tag.code}</span>
                </DetailRow>
                <DetailRow label="Asset">
                  <AssetLink asset={data.asset} />
                </DetailRow>
                <DetailRow label="Raised">
                  {formatDateTime(data.raisedAt)} at {formatReading(data.triggerValue, data.tag.unit)}
                </DetailRow>
                <DetailRow label="Cleared">
                  {data.clearedAt
                    ? `${formatDateTime(data.clearedAt)}${data.clearValue !== null ? ` at ${formatReading(data.clearValue, data.tag.unit)}` : ' (by hand)'}`
                    : 'Condition still present'}
                </DetailRow>
                <DetailRow label="Acknowledged">
                  {data.acknowledgedBy ? `${data.acknowledgedBy.name}, ${formatDateTime(data.acknowledgedAt)}` : 'Not yet'}
                  {data.acknowledgeNote && <p className="text-muted-foreground">“{data.acknowledgeNote}”</p>}
                </DetailRow>
              </DetailList>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-sm font-medium">Timeline</h3>
                {timeline.isPending ? (
                  <Skeleton className="h-24" />
                ) : (
                  <LogbookTimeline entries={timeline.data?.items ?? []} showAsset={false} className="ml-2.5" />
                )}
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!note.trim()) return;
                    addNote.mutate(
                      { input: { title: `Note on ${data.definition.name}`, body: note.trim(), alarmId: data.id } },
                      { onSuccess: () => setNote('') },
                    );
                  }}
                >
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add a note to this alarm’s timeline"
                    aria-label="Note"
                    maxLength={5000}
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={!note.trim() || addNote.isPending}>
                    Add note
                  </Button>
                </form>
              </section>
            </div>

            <AcknowledgeDialog ids={[data.id]} open={acknowledging} onOpenChange={setAcknowledging} />
          </>
        );
      }}
    </DetailLoader>
  );
}
