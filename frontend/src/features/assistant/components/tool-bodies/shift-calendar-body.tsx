import { ShiftCalendar } from '@/features/shifts/components/calendar/shift-calendar';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/**
 * The Shifts page's own calendar, for the period and filters Claude chose,
 * without its toolbar: "Open in new tab" is the way to look further. Admins
 * keep the shift and gap actions, as on the page.
 */
export function ShiftCalendarBody({ input }: { input: ToolInput<'showShiftCalendar'> }) {
  const { group, ...query } = withoutTitle(input);
  return <ShiftCalendar query={query} group={group} controls={false} />;
}
