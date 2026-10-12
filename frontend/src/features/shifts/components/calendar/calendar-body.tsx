import type { ShiftGrouping } from '@gen-ui/shared';
import type { CalendarViewProps } from '../../types';
import { DayTimeline } from './day-timeline';
import { MonthView } from './month-view';
import { WeekByPerson } from './week-by-person';
import { WeekByShift } from './week-by-shift';

/** Draws the period the data is for, which during navigation can still be the previous one. */
/** The view the calendar is set to, with the grouping for the week. */
export function CalendarBody(props: CalendarViewProps & { group: ShiftGrouping; now: Date }) {
  const { group, now, ...viewProps } = props;
  const { calendar } = viewProps;
  if (calendar.view === 'month') return <MonthView {...viewProps} />;
  if (calendar.view === 'day') return <DayTimeline {...viewProps} now={now} />;
  return group === 'person' ? <WeekByPerson {...viewProps} /> : <WeekByShift {...viewProps} />;
}
