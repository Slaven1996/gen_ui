import type { ReactNode } from 'react';
import { DetailCard } from '@/components/detail/detail-card';
import { AlarmDetail } from '@/features/alarms/components/alarm-detail';
import type { ToolInput } from '../../types';

/** The alarm's detail sheet from the Alarms page as a card, with the link beside its title. */
export function AlarmDetailBody({ input, action }: { input: ToolInput<'showAlarm'>; action?: ReactNode }) {
  return (
    <DetailCard>
      <AlarmDetail alarmId={input.alarmId} action={action} />
    </DetailCard>
  );
}
