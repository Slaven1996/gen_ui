import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  localPeriod,
  SHIFT_ROLES,
  templateTimes,
  UpdateShiftAssignmentSchema,
  type ShiftAssignment,
  type ShiftChangeResult,
  type ShiftChanges,
  type ShiftRole,
  type ShiftScope,
  type ShiftTemplate,
} from '@gen-ui/shared';
import { Field, fieldErrors } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { userOptionsQueryOptions } from '@/features/users/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { SHIFT_ROLE } from '@/lib/labels';
import { shiftTemplatesQueryOptions, useUpdateAssignment } from './api';
import { formatShortDate, shiftTimes } from './calendar-utils';
import { ScopeChoice } from './scope-choice';

/** Change one shift — or the person, role or notes of the rest of its series. */
export function EditShiftDialog({
  shift,
  timeZone,
  onOpenChange,
}: {
  shift: ShiftAssignment | null;
  timeZone: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={shift !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {shift && timeZone && <EditShiftForm shift={shift} timeZone={timeZone} onSaved={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

interface FormState {
  userId: string;
  role: ShiftRole;
  notes: string;
  templateId: string;
  date: string;
  startTime: string;
  hours: string;
}

const fromShift = (shift: ShiftAssignment, timeZone: string): FormState => {
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
const withPrefill = (form: FormState, prefill: ShiftChanges = {}, templates: readonly ShiftTemplate[] = []): FormState => {
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

/** Long text in a hint: its start, in quotes. */
const quoted = (value: string) => (value ? `“${value.length > 60 ? `${value.slice(0, 59)}…` : value}”` : 'empty');

/**
 * The shift form: the dialog's header, fields and button. The calendar shows
 * it in `EditShiftDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), with `prefill` over the shift's values and `initialScope`
 * picked, each changed value hinting what it was. Either way it sits inside a
 * `Dialog`, which its title and description need. The assistant waits for the
 * templates before opening it, so a new shift in `prefill` brings its hours.
 */
export function EditShiftForm({
  shift,
  timeZone,
  prefill,
  initialScope = 'one',
  disabled = false,
  onSaved,
}: {
  shift: ShiftAssignment;
  timeZone: string;
  prefill?: ShiftChanges;
  initialScope?: ShiftScope;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (result: ShiftChangeResult) => void;
}) {
  const id = useId();
  const templates = useQuery(shiftTemplatesQueryOptions());
  const users = useQuery(userOptionsQueryOptions());
  const [local] = useState(() => localPeriod(shift.startsAt, shift.endsAt, timeZone));
  const [initial] = useState(() => fromShift(shift, timeZone));
  // What the form opened with: the shift, with the assistant's changes over it.
  const [opened] = useState(() => withPrefill(initial, prefill, templates.data));
  const [form, setForm] = useState(opened);
  const [scope, setScope] = useState<ShiftScope>(shift.seriesId ? initialScope : 'one');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateAssignment();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // Another shift brings its own hours.
  const setTemplate = (templateId: string) => {
    const template = templates.data?.find((item) => item.id === templateId);
    setForm((current) => ({
      ...current,
      templateId,
      ...(template && { startTime: template.startTime, hours: String(template.durationMinutes / 60) }),
    }));
  };

  // A value the assistant changed says what it was.
  const was = (key: keyof FormState, show: (value: string) => string = (value) => value || 'empty') =>
    prefill && opened[key] !== initial[key] ? `Was ${show(initial[key])}` : undefined;

  const durationMinutes = Math.round(Number(form.hours) * 60);
  const notes = form.notes.trim() || null;
  const onlyThis = scope === 'one';
  const patch = {
    ...(form.userId !== initial.userId && { userId: form.userId }),
    ...(form.role !== initial.role && { role: form.role }),
    ...(notes !== (shift.notes ?? null) && { notes }),
    // The day and hours move one shift at a time.
    ...(onlyThis && form.templateId !== initial.templateId && { templateId: form.templateId }),
    ...(onlyThis && form.date !== initial.date && { date: form.date }),
    ...(onlyThis && form.startTime !== initial.startTime && { startTime: form.startTime }),
    ...(onlyThis && durationMinutes !== local.durationMinutes && { durationMinutes }),
  };
  const changed = Object.keys(patch).length > 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = UpdateShiftAssignmentSchema.safeParse(patch);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    update.mutate({ id: shift.id, scope, patch: parsed.data }, { onSuccess: onSaved });
  };

  // Inactive templates stay listed only for the shift that already uses one.
  const templateOptions = (templates.data ?? []).filter((item) => item.isActive || item.id === shift.template.id);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>
          {shift.user.name} · {shift.template.name}
        </DialogTitle>
        <DialogDescription>
          {formatShortDate(shift.date)}, {shiftTimes(shift, timeZone).label} ({timeZone})
        </DialogDescription>
      </DialogHeader>

      {shift.seriesId && <ScopeChoice value={scope} onChange={setScope} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-user`} label="Person" error={errors.userId} hint={was('userId', () => shift.user.name)}>
          <Select value={form.userId} onValueChange={(value) => set('userId', value)}>
            <SelectTrigger id={`${id}-user`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!users.data?.some((user) => user.id === shift.user.id) && (
                <SelectItem value={shift.user.id}>{shift.user.name}</SelectItem>
              )}
              {users.data?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-role`} label="Role" hint={was('role', (value) => SHIFT_ROLE[value as ShiftRole])}>
          <Select value={form.role} onValueChange={(value) => set('role', value as ShiftRole)}>
            <SelectTrigger id={`${id}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {SHIFT_ROLE[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <fieldset disabled={!onlyThis} className="space-y-3 rounded-md border p-3 disabled:opacity-60">
        <legend className="px-1 text-sm font-medium">When</legend>
        {!onlyThis && <p className="text-xs text-muted-foreground">The day and hours change one shift at a time.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-template`} label="Shift" error={errors.templateId} hint={was('templateId', () => shift.template.name)}>
            <Select value={form.templateId} onValueChange={setTemplate} disabled={!onlyThis}>
              <SelectTrigger id={`${id}-template`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: item.color }} />
                    {item.name} · {templateTimes(item).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id={`${id}-date`} label="Date" error={errors.date} hint={was('date', formatShortDate)}>
            <Input id={`${id}-date`} type="date" value={form.date} onChange={(event) => set('date', event.target.value)} />
          </Field>
          <Field id={`${id}-start`} label="Starts" error={errors.startTime} hint={was('startTime')}>
            <Input id={`${id}-start`} type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} />
          </Field>
          <Field
            id={`${id}-hours`}
            label="Hours"
            error={errors.durationMinutes && '0.25–24'}
            hint={was('hours', (value) => `${value} h`)}
          >
            <Input
              id={`${id}-hours`}
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              value={form.hours}
              onChange={(event) => set('hours', event.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <Field id={`${id}-notes`} label="Notes" error={errors.notes} hint={was('notes', quoted)}>
        <Textarea id={`${id}-notes`} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>
      {update.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(update.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || !changed || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
