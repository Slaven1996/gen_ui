import { useQuery } from '@tanstack/react-query';
import { alarmDefinitionQueryOptions } from '@/features/alarms/api/queries';
import { DefinitionForm } from '@/features/alarms/components/definition-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The rule as it is now, with Claude's changes over it. */
export function EditAlarmRuleBody({ input, disabled, onSaved }: FormProps<'editAlarmRule'>) {
  const rule = useQuery(alarmDefinitionQueryOptions(input.ruleId));
  return (
    <WhenLoaded query={rule}>
      {(definition) => (
        <DefinitionForm
          definition={definition}
          prefill={input.changes}
          disabled={disabled}
          onSaved={(saved) => onSaved(saved.id)}
        />
      )}
    </WhenLoaded>
  );
}
