import type { AlarmCondition, AlarmDefinition, AlarmSeverity, RulePrefill } from '@gen-ui/shared';

export interface DefinitionFormState {
  tagId: string;
  name: string;
  description: string;
  condition: AlarmCondition;
  threshold: string;
  deadband: string;
  severity: AlarmSeverity;
  isEnabled: boolean;
}

export const fromDefinition = (definition?: AlarmDefinition, tagId?: string): DefinitionFormState => ({
  tagId: definition?.tagId ?? tagId ?? '',
  name: definition?.name ?? '',
  description: definition?.description ?? '',
  condition: definition?.condition ?? 'ABOVE',
  threshold: definition ? String(definition.threshold) : '',
  deadband: definition ? String(definition.deadband) : '0',
  severity: definition?.severity ?? 'MEDIUM',
  isEnabled: definition?.isEnabled ?? true,
});

/** `form`, with the values the assistant filled in put over it. */
export const withPrefill = (form: DefinitionFormState, prefill: RulePrefill = {}): DefinitionFormState => ({
  ...form,
  name: prefill.name ?? form.name,
  description: prefill.description ?? form.description,
  condition: prefill.condition ?? form.condition,
  threshold: prefill.threshold === undefined ? form.threshold : String(prefill.threshold),
  deadband: prefill.deadband === undefined ? form.deadband : String(prefill.deadband),
  severity: prefill.severity ?? form.severity,
  isEnabled: prefill.isEnabled ?? form.isEnabled,
});
