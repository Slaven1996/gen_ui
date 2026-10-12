import type { ShiftRole, ShiftTemplate, ShiftTemplatePrefill } from '@gen-ui/shared';
import { coverageSummary } from './calendar-utils';

export interface RuleState {
  key: number;
  role: ShiftRole;
  weekdays: number[];
  headcount: string;
}

export interface TemplateFormState {
  name: string;
  startTime: string;
  hours: string;
  color: string;
  isActive: boolean;
  rules: RuleState[];
}

let nextKey = 0;
export const rule = (values: Omit<RuleState, 'key'>): RuleState => ({ key: nextKey++, ...values });

export const fromTemplate = (template?: ShiftTemplate): TemplateFormState => ({
  name: template?.name ?? '',
  startTime: template?.startTime ?? '06:00',
  hours: String((template?.durationMinutes ?? 480) / 60),
  color: template?.color ?? '#3b82f6',
  isActive: template?.isActive ?? true,
  rules: (template?.coverage ?? []).map((item) => rule({ ...item, headcount: String(item.headcount) })),
});

/** `form`, with the values the assistant filled in put over it; its staffing replaces the whole list. */
export const withPrefill = (form: TemplateFormState, prefill: ShiftTemplatePrefill = {}): TemplateFormState => ({
  name: prefill.name ?? form.name,
  startTime: prefill.startTime ?? form.startTime,
  hours: prefill.durationMinutes === undefined ? form.hours : String(prefill.durationMinutes / 60),
  color: prefill.color ?? form.color,
  isActive: prefill.isActive ?? form.isActive,
  rules:
    prefill.coverage === undefined
      ? form.rules
      : prefill.coverage.map((item) => rule({ ...item, headcount: String(item.headcount) })),
});

/** "Operator · Supervisor Mon–Fri", or "none": the staffing a form's rules describe. */
export const staffing = (rules: readonly RuleState[]) =>
  coverageSummary(rules.map(({ role, weekdays, headcount }) => ({ role, weekdays, headcount: Number(headcount) }))) ||
  'none';
