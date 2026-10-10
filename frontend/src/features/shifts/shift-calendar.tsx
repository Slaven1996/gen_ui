import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react';
import {
  SHIFT_CALENDAR_VIEWS,
  ShiftCalendarQuerySchema,
  stepCalendar,
  utcOffset,
  zonedDate,
  type ShiftCalendarQueryInput,
} from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { CALENDAR_VIEW } from '@/lib/labels';
import { browserTimeZone, parseLeniently } from '@/lib/search';
import { cn } from '@/lib/utils';
import { shiftCalendarQueryOptions } from './api';
import { buildCalendarModel, periodTitle, samePeriod, type CalendarViewProps } from './calendar-utils';
import { CopyWeekDialog } from './copy-week-dialog';
import { DayTimeline } from './day-timeline';
import { MonthView } from './month-view';
import { useShiftActions } from './use-shift-actions';
import { WeekByPerson } from './week-by-person';
import { WeekByShift } from './week-by-shift';

export const SHIFT_GROUPINGS = ['shift', 'person'] as const;
export type ShiftGrouping = (typeof SHIFT_GROUPINGS)[number];

const GROUPING_LABEL: Record<ShiftGrouping, string> = { shift: 'By shift', person: 'By person' };

/** Ticks once a minute, for the now-line and for "today" rolling over at midnight. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The shift plan as a month, a week (by shift or by person) or a day, in the
 * plant time zone. Like the domain tables, it takes the page's query and
 * fetches its own data; with `onQueryChange` it keeps navigation in the URL,
 * without it (an embed) it keeps it locally. Admins get the actions.
 */
export function ShiftCalendar({
  query,
  onQueryChange,
  group: groupProp,
  onGroupChange,
  filters,
}: {
  query: ShiftCalendarQueryInput;
  onQueryChange?: (query: ShiftCalendarQueryInput) => void;
  group?: ShiftGrouping;
  onGroupChange?: (group: ShiftGrouping) => void;
  /** The page's filter bar, shown in the toolbar. */
  filters?: ReactNode;
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
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{data ? periodTitle(data) : ' '}</h3>
          {data && <ZoneHint timeZone={data.timeZone} />}
        </div>
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
      </div>

      {calendar.isPending ? (
        <Skeleton className="h-[28rem]" />
      ) : !data || !model || !today ? (
        <p className="rounded-lg border py-10 text-center text-sm text-destructive">{getErrorMessage(calendar.error)}</p>
      ) : (
        <div className={cn('transition-opacity', calendar.isPlaceholderData && 'opacity-60')} aria-busy={calendar.isPlaceholderData}>
          <CalendarBody calendar={data} model={model} today={today} actions={actions} onOpenDay={openDay} group={group} now={now} />
        </div>
      )}

      {actions && data?.view === 'week' && (
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

/** Draws the period the data is for, which during navigation can still be the previous one. */
function CalendarBody(props: CalendarViewProps & { group: ShiftGrouping; now: Date }) {
  const { group, now, ...viewProps } = props;
  const { calendar } = viewProps;
  if (calendar.view === 'month') return <MonthView {...viewProps} />;
  if (calendar.view === 'day') return <DayTimeline {...viewProps} now={now} />;
  return group === 'person' ? <WeekByPerson {...viewProps} /> : <WeekByShift {...viewProps} />;
}

/** "Times in Europe/Budapest" — only when that isn't the viewer's own clock. */
function ZoneHint({ timeZone }: { timeZone: string }) {
  if (utcOffset(timeZone) === utcOffset(browserTimeZone)) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Times in {timeZone} (UTC{utcOffset(timeZone)})
    </p>
  );
}

/** A row of pressed/unpressed buttons for picking one value. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            className={cn('h-7 px-2.5', active && 'bg-background shadow-xs hover:bg-background')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

