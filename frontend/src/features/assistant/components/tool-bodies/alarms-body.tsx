import { useState } from 'react';
import { ListAlarmsQuerySchema } from '@gen-ui/shared';
import { AlarmDetailSheet } from '@/features/alarms/components/alarm-detail-sheet';
import { AlarmsTable } from '@/features/alarms/components/alarms-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/**
 * The Alarms page's own table. A click opens the alarm in the same sheet as
 * on the page (acknowledge, clear, chart, timeline), kept here instead of in
 * the URL. Selecting several for one acknowledgement stays on the page.
 */
export function AlarmsBody({ input }: { input: ToolInput<'listAlarms'> }) {
  const [openAlarm, setOpenAlarm] = useState<string>();
  return (
    <>
      <AlarmsTable
        query={ListAlarmsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })}
        dense
        onAlarmClick={(alarm) => setOpenAlarm(alarm.id)}
      />
      <AlarmDetailSheet alarmId={openAlarm} onClose={() => setOpenAlarm(undefined)} />
    </>
  );
}

