import { DefinitionForm } from '@/features/alarms/components/definition-form';
import type { FormProps } from '../../types';

export function CreateAlarmRuleBody({ input: { tagId, ...prefill }, disabled, onSaved }: FormProps<'createAlarmRule'>) {
  return (
    <DefinitionForm initialTagId={tagId} prefill={prefill} disabled={disabled} onSaved={(rule) => onSaved(rule.id)} />
  );
}
