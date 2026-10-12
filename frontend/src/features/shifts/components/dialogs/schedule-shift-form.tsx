import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreateShiftAssignmentSchema,
  SHIFT_ROLES,
  templateTimes,
  type ShiftChangeResult,
  type ShiftRole,
  type ShiftSchedulePrefill,
} from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { userOptionsQueryOptions } from '@/features/users/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { SHIFT_ROLE } from '@/lib/labels';
import { useCreateAssignments } from '../../api/mutations';
import { shiftTemplatesQueryOptions } from '../../api/queries';
import { initial, roleFor, type ScheduleShiftFormState } from '../../lib/schedule-shift-form-state';
import { WeekdayToggles } from './weekday-toggles';

/**
 * The schedule form: the dialog's header, fields and button. The Shifts page
 * shows it in `ScheduleShiftDialog`, opened from the header or an unfilled
 * slot; the assistant shows it inside an answer (`InlineDialog`), with
 * everything the user said filled in. Either way it sits inside a `Dialog`,
 * which its title and description need.
 */
export function ScheduleShiftForm({
  prefill = {},
  date,
  timeZone,
  disabled = false,
  onSaved,
}: {
  prefill?: ShiftSchedulePrefill;
  /** The first day, when `prefill` has none. */
  date: string;
  timeZone?: string;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (result: ShiftChangeResult) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => initial(prefill.date ?? date, prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A role chosen by hand (or by the slot that opened the form) stays put when the shift changes.
  const [roleChosen, setRoleChosen] = useState(Boolean(prefill.role));
  const templates = useQuery(shiftTemplatesQueryOptions());
  const users = useQuery(userOptionsQueryOptions());
  const create = useCreateAssignments();

  const activeTemplates = (templates.data ?? []).filter((template) => template.isActive);
  const template = activeTemplates.find((item) => item.id === form.templateId);
  const role = roleChosen ? form.role : (roleFor(template, form.date) ?? form.role);

  const set = <K extends keyof ScheduleShiftFormState>(key: K, value: ScheduleShiftFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const setCustomHours = (on: boolean) =>
    setForm((current) => ({
      ...current,
      customHours: on,
      // Start from the shift's own hours.
      ...(on && template && { startTime: template.startTime, hours: String(template.durationMinutes / 60) }),
    }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateShiftAssignmentSchema.safeParse({
      templateId: form.templateId,
      userId: form.userId,
      role,
      date: form.date,
      notes: form.notes.trim() || null,
      // A blank half of own hours (only one given) keeps the shift's own.
      ...(form.customHours && {
        startTime: form.startTime || undefined,
        durationMinutes: form.hours === '' ? undefined : Math.round(Number(form.hours) * 60),
      }),
      ...(form.repeat && { repeat: { until: form.until, weekdays: form.weekdays } }),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(parsed.data, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Schedule a shift</DialogTitle>
        <DialogDescription>
          Dates and times are the plant’s{timeZone ? ` (${timeZone})` : ''}. Nobody can be on two shifts at once.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-user`} label="Person" error={errors.userId && 'Choose a person'}>
          <Select value={form.userId} onValueChange={(value) => set('userId', value)}>
            <SelectTrigger id={`${id}-user`} className="w-full">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {users.data?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-template`} label="Shift" error={errors.templateId && 'Choose a shift'}>
          <Select value={form.templateId} onValueChange={(value) => set('templateId', value)}>
            <SelectTrigger id={`${id}-template`} className="w-full">
              <SelectValue placeholder="Choose a shift" />
            </SelectTrigger>
            <SelectContent>
              {activeTemplates.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: item.color }} />
                  {item.name} · {templateTimes(item).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-role`} label="Role">
          <Select
            value={role}
            onValueChange={(value) => {
              setRoleChosen(true);
              set('role', value as ShiftRole);
            }}
          >
            <SelectTrigger id={`${id}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {SHIFT_ROLE[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-date`} label={form.repeat ? 'From' : 'Date'} error={errors.date}>
          <Input id={`${id}-date`} type="date" value={form.date} onChange={(event) => set('date', event.target.value)} />
        </Field>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-custom`} checked={form.customHours} onCheckedChange={(checked) => setCustomHours(checked === true)} />
          <Label htmlFor={`${id}-custom`}>Own hours</Label>
          {!form.customHours && template && (
            <span className="text-xs text-muted-foreground">{templateTimes(template).label}, as the shift says</span>
          )}
        </div>
        {form.customHours && (
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${id}-start`} label="Starts" error={errors.startTime}>
              <Input id={`${id}-start`} type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} />
            </Field>
            <Field id={`${id}-hours`} label="Hours" error={errors.durationMinutes && '0.25–24'}>
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
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-repeat`} checked={form.repeat} onCheckedChange={(checked) => set('repeat', checked === true)} />
          <Label htmlFor={`${id}-repeat`}>Repeat weekly</Label>
        </div>
        {form.repeat && (
          <>
            <WeekdayToggles value={form.weekdays} onChange={(weekdays) => set('weekdays', weekdays)} />
            <Field id={`${id}-until`} label="Until (inclusive)" error={errors.repeat}>
              <Input id={`${id}-until`} type="date" min={form.date} value={form.until} onChange={(event) => set('until', event.target.value)} />
            </Field>
          </>
        )}
      </div>

      <Field id={`${id}-notes`} label="Notes" error={errors.notes}>
        <Textarea id={`${id}-notes`} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>
      {create.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(create.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || create.isPending}>
          {create.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
      </DialogFooter>
    </form>
  );
}
