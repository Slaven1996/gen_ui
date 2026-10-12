import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ShiftRole } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { onDutyQueryOptions } from '../../api/queries';
import { formatClock } from '../../lib/calendar-utils';
import { OnDutyHalf } from './on-duty-half';

/**
 * Who is on duty now — whom alarm escalation would page — and who takes over
 * next. The Shifts page shows both halves as its top band. The assistant
 * shows one (`only`) as a card in its answer, with its link as `action`. The
 * "On duty now" dashboard widget shows the first, `stacked` and unframed
 * inside the widget's own card.
 */
export function OnDutyStrip({
  only,
  role,
  action,
  stacked = false,
  framed = true,
}: {
  /** One half: who is on shift now, or who takes over next. Both without it. */
  only?: 'now' | 'next';
  /** Only people on shift in these roles. */
  role?: ShiftRole[];
  /** Shown in the top-right corner, e.g. a link to the page. */
  action?: ReactNode;
  /** One person per row, for a narrow tile. */
  stacked?: boolean;
  /** false: inside another card, which gives the title: no border, background or heading of its own. */
  framed?: boolean;
}) {
  const onDuty = useQuery(onDutyQueryOptions({ role }));
  if (onDuty.isPending) return <Skeleton className={stacked ? 'h-24' : 'h-16'} />;
  const data = onDuty.data;
  if (!data) return null;
  const handover = data.next[0];
  // Next to who is on now, the handover shows only once there is one.
  const showNext = only === 'next' || (only === undefined && handover !== undefined);
  const heading = (text: string) => (framed ? text : undefined);

  return (
    <section
      aria-label={only === 'next' ? 'Next on duty' : only === 'now' ? 'On duty now' : 'On duty'}
      className={cn('flex items-start gap-x-4', framed && 'rounded-lg border bg-card px-4 py-3')}
    >
      <div className={cn('flex min-w-0 flex-1 items-start gap-x-8 gap-y-3', stacked ? 'flex-col' : 'flex-wrap')}>
        {only !== 'next' && (
          <OnDutyHalf
            heading={heading('On duty now')}
            shifts={data.items}
            timeZone={data.timeZone}
            stacked={stacked}
            empty={<p className="text-sm text-destructive">Nobody is on shift right now.</p>}
          />
        )}
        {showNext && (
          <OnDutyHalf
            heading={heading(handover ? `Next, at ${formatClock(handover.startsAt, data.timeZone)}` : 'Next')}
            shifts={data.next}
            timeZone={data.timeZone}
            stacked={stacked}
            empty={<p className="text-sm text-muted-foreground">No shift starts in the next 24 hours.</p>}
          />
        )}
      </div>
      {action && <div className="-my-1 -mr-2 shrink-0">{action}</div>}
    </section>
  );
}
