import type { FormToolName, ShiftChangeResult } from '@gen-ui/shared';
import type { FormProps } from '../types';

export type Changes = Record<string, { from: unknown; to: unknown }>;

/**
 * How a changed field reads in an edit's result line: its label (default:
 * the field's name) and its values (`null`: just say it changed, for long text).
 */
export type ChangeLabels = Record<string, { label?: string; show?: ((value: unknown) => string) | null }>;

export const shownValue = (value: unknown): string => {
  if (value === null || value === '') return 'none';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
};

/** A value shown by its label: HIGH → High. */
export const byLabel = (label: (value: string) => string | undefined) => (value: unknown) =>
  (typeof value === 'string' && label(value)) || shownValue(value);

/** "threshold 4.5 → 5, severity High → Critical", from an edit's recorded changes. */
export function describeChanges(changed: Changes, labels: ChangeLabels): string {
  return Object.entries(changed)
    .map(([field, { from, to }]) => {
      const { label = field, show = shownValue } = labels[field] ?? {};
      return show === null ? `${label} updated` : `${label} ${show(from)} → ${show(to)}`;
    })
    .join(', ');
}

/** A text value after an edit: the new one if the user changed it (e.g. renamed the record). */
export function afterEdit(changed: Changes | null, field: string, before: string): string {
  const to = changed?.[field]?.to;
  return typeof to === 'string' ? to : before;
}

/**
 * "Saved “PS-01 RTU”: status Online → Maintenance", or "Saved “PS-01 RTU”
 * without changes". `nameField`: the field `name` comes from, in case the
 * user changed it.
 */
export function savedEdit(changed: Changes | null, name: string, labels: ChangeLabels, nameField = 'name'): string {
  return changed
    ? `Saved “${afterEdit(changed, nameField, name)}”: ${describeChanges(changed, labels)}`
    : `Saved “${name}” without changes`;
}

/** What a shift save reports: the first shift, and every one (a repeat or a copy saves several). */
export const reportShifts = (onSaved: FormProps<FormToolName>['onSaved']) => ({ items }: ShiftChangeResult) =>
  onSaved(items[0].id, items.map((item) => item.id));
