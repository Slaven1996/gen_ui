import type { ReactNode } from 'react';
import { DetailCard } from '@/components/detail/detail-card';
import { DefinitionDetail } from '@/features/alarms/components/definition-detail';
import type { ToolInput } from '../../types';

/** The rule's detail sheet from the Alarm rules page as a card, with the link beside its title. */
export function AlarmRuleDetailBody({ input, action }: { input: ToolInput<'showAlarmRule'>; action?: ReactNode }) {
  return (
    <DetailCard>
      <DefinitionDetail definitionId={input.ruleId} action={action} />
    </DetailCard>
  );
}
