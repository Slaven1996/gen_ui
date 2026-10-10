import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreateShiftAssignmentSchema,
  SHIFT_ROLES,
  weekdayOf,
  zonedDate,
  type ShiftRole,
  type ShiftTemplate,
} from '@gen-ui/shared';
import { Field, fieldErrors } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { userOptionsQueryOptions } from '@/features/users/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { SHIFT_ROLE } from '@/lib/labels';
import { browserTimeZone } from '@/lib/search';
import { shiftTemplatesQueryOptions, useCreateAssignments } from './api';
import { templateTimes } from './calendar-utils';
import { WeekdayToggles } from './weekday-toggles';
import type { SchedulePrefill } from './use-shift-actions';

interface FormState {
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

const initial = (date: string, prefill: SchedulePrefill): FormState => ({
  templateId: prefill.templateId ?? '',
  userId: '',
  role: prefill.role ?? 'OPERATOR',
  date,
  notes: '',
  customHours: false,
  startTime: '',
  hours: '',
  repeat: false,
  until: date,
  weekdays: [1, 2, 3, 4, 5],
});

/** The role a shift's staffing target asks for on `date`, if it names one. */
const roleFor = (template: ShiftTemplate | undefined, date: string): ShiftRole | undefined =>
  template?.coverage.find((rule) => rule.weekdays.includes(weekdayOf(date)))?.role ?? template?.coverage[0]?.role;

/** Put someone on a shift for a day, or on chosen weekdays until a date. */
export function ScheduleShiftDialog({
  open,
  onOpenChange,
  prefill,
  defaultDate,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: SchedulePrefill;
  /** When `prefill` has no date; today otherwise. */
  defaultDate?: string;
  /** The plant time zone, to say which zone the times are in. */
  timeZone?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh with the prefill. */}
        <ScheduleShiftForm
          prefill={prefill}
          date={prefill?.date ?? defaultDate ?? zonedDate(new Date(), timeZone ?? browserTimeZone)}
          timeZone={timeZone}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleShiftForm({
  prefill = {},
  date,
  timeZone,
  onSaved,
}: {
  prefill?: SchedulePrefill;
  date: string;
  timeZone?: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => initial(date, prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A role chosen by hand (or by the slot that opened the form) stays put when the shift changes.
  const [roleChosen, setRoleChosen] = useState(Boolean(prefill.role));
  const templates = useQuery(shiftTemplatesQueryOptions());
  const users = useQuery(userOptionsQueryOptions());
  const create = useCreateAssignments();

  const activeTemplates = (templates.data ?? []).filter((template) => template.isActive);
  const template = activeTemplates.find((item) => item.id === form.templateId);
  const role = roleChosen ? form.role : (roleFor(template, form.date) ?? form.role);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

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
      ...(form.customHours && { startTime: form.startTime, durationMinutes: Math.round(Number(form.hours) * 60) }),
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
        <Field id="schedule-user" label="Person" error={errors.userId && 'Choose a person'}>
          <Select value={form.userId} onValueChange={(value) => set('userId', value)}>
            <SelectTrigger id="schedule-user" className="w-full">
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
        <Field id="schedule-template" label="Shift" error={errors.templateId && 'Choose a shift'}>
          <Select value={form.templateId} onValueChange={(value) => set('templateId', value)}>
            <SelectTrigger id="schedule-template" className="w-full">
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
        <Field id="schedule-role" label="Role">
          <Select
            value={role}
            onValueChange={(value) => {
              setRoleChosen(true);
              set('role', value as ShiftRole);
            }}
          >
            <SelectTrigger id="schedule-role" className="w-full">
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
        <Field id="schedule-date" label={form.repeat ? 'From' : 'Date'} error={errors.date}>
          <Input id="schedule-date" type="date" value={form.date} onChange={(event) => set('date', event.target.value)} />
        </Field>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox id="schedule-custom" checked={form.customHours} onCheckedChange={(checked) => setCustomHours(checked === true)} />
          <Label htmlFor="schedule-custom">Own hours</Label>
          {!form.customHours && template && (
            <span className="text-xs text-muted-foreground">{templateTimes(template).label}, as the shift says</span>
          )}
        </div>
        {form.customHours && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="schedule-start" label="Starts" error={errors.startTime}>
              <Input id="schedule-start" type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} />
            </Field>
            <Field id="schedule-hours" label="Hours" error={errors.durationMinutes && '0.25–24'}>
              <Input
                id="schedule-hours"
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
          <Checkbox id="schedule-repeat" checked={form.repeat} onCheckedChange={(checked) => set('repeat', checked === true)} />
          <Label htmlFor="schedule-repeat">Repeat weekly</Label>
        </div>
        {form.repeat && (
          <>
            <WeekdayToggles value={form.weekdays} onChange={(weekdays) => set('weekdays', weekdays)} />
            <Field id="schedule-until" label="Until (inclusive)" error={errors.repeat}>
              <Input id="schedule-until" type="date" min={form.date} value={form.until} onChange={(event) => set('until', event.target.value)} />
            </Field>
          </>
        )}
      </div>

      <Field id="schedule-notes" label="Notes" error={errors.notes}>
        <Textarea id="schedule-notes" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>
      {create.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(create.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
      </DialogFooter>
    </form>
  );
}
