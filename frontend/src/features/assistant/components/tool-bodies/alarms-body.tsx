import { ListAlarmsQuerySchema } from '@gen-ui/shared';
import { AlarmsTable } from '@/features/alarms/components/alarms-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/**
 * The Alarms page's own table. A click opens the alarm in the same sheet as
 * on the page (acknowledge, clear, chart, timeline), kept by the table
 * instead of in the URL. Selecting several for one acknowledgement stays on
 * the page.
 */
export function AlarmsBody({ input }: { input: ToolInput<'listAlarms'> }) {
  return <AlarmsTable query={ListAlarmsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}
