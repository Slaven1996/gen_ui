import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react';
import {
  SHIFT_CALENDAR_VIEWS,
  SHIFT_GROUPINGS,
  ShiftCalendarQuerySchema,
  stepCalendar,
  zonedDate,
  type ShiftCalendarQueryInput,
  type ShiftGrouping,
} from '@gen-ui/shared';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { CALENDAR_VIEW } from '@/lib/labels';
import { parseLeniently } from '@/lib/search';
import { cn } from '@/lib/utils';
import { shiftCalendarQueryOptions } from '../../api/queries';
import { useNow } from '../../hooks/use-now';
import { useShiftActions } from '../../hooks/use-shift-actions';
import { buildCalendarModel, periodTitle, samePeriod } from '../../lib/calendar-utils';
import { CopyWeekDialog } from '../dialogs/copy-week-dialog';
import { CalendarBody } from './calendar-body';
import { ZoneHint } from './zone-hint';

const GROUPING_LABEL: Record<ShiftGrouping, string> = { shift: 'By shift', person: 'By person' };

/**
 * The shift plan as a month, a week (by shift or by person) or a day, in the
 * plant time zone. Like the domain tables, it takes the page's query and
 * fetches its own data; with `onQueryChange` it keeps navigation in the URL,
 * without it (an embed) it keeps it locally. Admins get the actions.
 * `controls={false}` (a chat answer) shows just the period the query names:
 * no navigation, view switches, Copy week or filters, and day headers that
 * don't open a day. Admins still get the shift and gap actions there.
 */
export function ShiftCalendar({
  query,
  onQueryChange,
  group: groupProp,
  onGroupChange,
  filters,
  controls = true,
}: {
  query: ShiftCalendarQueryInput;
  onQueryChange?: (query: ShiftCalendarQueryInput) => void;
  group?: ShiftGrouping;
  onGroupChange?: (group: ShiftGrouping) => void;
  /** The page's filter bar, shown in the toolbar. */
  filters?: ReactNode;
  /** false: the period title only, without the toolbar's buttons and switches. */
  controls?: boolean;
}) {
  const [view, setView] = useViewQuery(query, onQueryChange);
  const [localGroup, setLocalGroup] = useState<ShiftGrouping>('shift');
  const group = groupProp ?? localGroup;
  const setGroup = onGroupChange ?? setLocalGroup;
  const [copying, setCopying] = useState(false);

  const calendar = useQuery(shiftCalendarQueryOptions(view));
  const data = calendar.data;
  const model = useMemo(() => data && buildCalendarModel(data), [data]);
  const now = useNow();
  const today = data ? zonedDate(now, data.timeZone) : undefined;
  const { actions, dialogs } = useShiftActions(data?.timeZone);
  const { view: requestedView, userId, templateId } = parseLeniently(ShiftCalendarQuerySchema, view);

  // A step that lands back on the current period drops `date`, so the URL keeps following "today".
  const go = (direction: -1 | 1) => {
    if (!data || !today) return;
    const next = stepCalendar(data.view, data.date, direction);
    setView({ date: samePeriod(data.view, next, today) ? undefined : next });
  };
  const openDay = (date: string) => setView({ view: 'day', date: date === today ? undefined : date });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {controls && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => go(-1)} disabled={!data}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView({ date: undefined })} disabled={!view.date}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => go(1)} disabled={!data}>
              <ChevronRight />
            </Button>
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{data ? periodTitle(data) : ' '}</h3>
          {data && <ZoneHint timeZone={data.timeZone} />}
        </div>
        {controls && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {filters}
            <Segmented
              label="Period"
              options={SHIFT_CALENDAR_VIEWS.map((value) => ({ value, label: CALENDAR_VIEW[value] }))}
              value={requestedView}
              onChange={(next) => setView({ view: next })}
            />
            {requestedView === 'week' && (
              <Segmented
                label="Rows"
                options={SHIFT_GROUPINGS.map((value) => ({ value, label: GROUPING_LABEL[value] }))}
                value={group}
                onChange={setGroup}
              />
            )}
            {actions && requestedView === 'week' && data?.view === 'week' && (
              <Button variant="outline" size="sm" onClick={() => setCopying(true)}>
                <CopyPlus />
                Copy week
              </Button>
            )}
          </div>
        )}
      </div>

      {calendar.isPending ? (
        <Skeleton className="h-[28rem]" />
      ) : !data || !model || !today ? (
        <p className="rounded-lg border py-10 text-center text-sm text-destructive">{getErrorMessage(calendar.error)}</p>
      ) : (
        <div className={cn('transition-opacity', calendar.isPlaceholderData && 'opacity-60')} aria-busy={calendar.isPlaceholderData}>
          <CalendarBody
            calendar={data}
            model={model}
            today={today}
            actions={actions}
            onOpenDay={controls ? openDay : undefined}
            group={group}
            now={now}
          />
        </div>
      )}

      {controls && actions && data?.view === 'week' && (
        <CopyWeekDialog
          open={copying}
          onOpenChange={setCopying}
          week={{ from: data.from, to: data.to }}
          filters={{ userId, templateId }}
        />
      )}
      {dialogs}
    </section>
  );
}
