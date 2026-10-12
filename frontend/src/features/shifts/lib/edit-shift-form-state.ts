import {
  localPeriod,
  type ShiftAssignment,
  type ShiftChanges,
  type ShiftRole,
  type ShiftTemplate,
} from '@gen-ui/shared';

export interface EditShiftFormState {
  userId: string;
  role: ShiftRole;
  notes: string;
  templateId: string;
  date: string;
  startTime: string;
  hours: string;
}

export const fromShift = (shift: ShiftAssignment, timeZone: string): EditShiftFormState => {
  const local = localPeriod(shift.startsAt, shift.endsAt, timeZone);
  return {
    userId: shift.user.id,
    role: shift.role,
    notes: shift.notes ?? '',
    templateId: shift.template.id,
    date: local.date,
    startTime: local.startTime,
    hours: String(local.durationMinutes / 60),
  };
};

/** `form`, with the changes the assistant filled in put over it; another shift brings its own hours unless given. */
export const withPrefill = (form: EditShiftFormState, prefill: ShiftChanges = {}, templates: readonly ShiftTemplate[] = []): EditShiftFormState => {
  const template =
    prefill.templateId !== undefined && prefill.templateId !== form.templateId
      ? templates.find((item) => item.id === prefill.templateId)
      : undefined;
  return {
    userId: prefill.userId ?? form.userId,
    role: prefill.role ?? form.role,
    // null: no notes.
    notes: prefill.notes === undefined ? form.notes : (prefill.notes ?? ''),
    templateId: prefill.templateId ?? form.templateId,
    date: prefill.date ?? form.date,
    startTime: prefill.startTime ?? template?.startTime ?? form.startTime,
    hours:
      prefill.durationMinutes !== undefined
        ? String(prefill.durationMinutes / 60)
        : template
          ? String(template.durationMinutes / 60)
          : form.hours,
  };
};

