import { weekdayOf, type ShiftRole, type ShiftSchedulePrefill, type ShiftTemplate } from '@gen-ui/shared';

export interface ScheduleShiftFormState {
  templateId: string;
  userId: string;
  role: ShiftRole;
  date: string;
  notes: string;
  customHours: boolean;
  startTime: string;
  hours: string;
  repeat: boolean;
  until: string;
  weekdays: number[];
}

export const initial = (date: string, prefill: ShiftSchedulePrefill): ScheduleShiftFormState => ({
  templateId: prefill.templateId ?? '',
  userId: prefill.userId ?? '',
  role: prefill.role ?? 'OPERATOR',
  date,
  notes: prefill.notes ?? '',
  // Own hours given: the form opens with them switched on.
  customHours: prefill.startTime !== undefined || prefill.durationMinutes !== undefined,
  startTime: prefill.startTime ?? '',
  hours: prefill.durationMinutes === undefined ? '' : String(prefill.durationMinutes / 60),
  repeat: prefill.repeat !== undefined,
  until: prefill.repeat?.until ?? date,
  weekdays: prefill.repeat?.weekdays ?? [1, 2, 3, 4, 5],
});

/** The role a shift's staffing target asks for on `date`, if it names one. */
export const roleFor = (template: ShiftTemplate | undefined, date: string): ShiftRole | undefined =>
  template?.coverage.find((rule) => rule.weekdays.includes(weekdayOf(date)))?.role ?? template?.coverage[0]?.role;
