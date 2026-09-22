import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreateShiftAssignmentSchema, SHIFT_ROLES, type ShiftRole } from '@gen-ui/shared';
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

/** Monday first, as the calendar shows them; values are JavaScript's (0 = Sunday). */
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

interface FormState {
  templateId: string;
  userId: string;
  role: ShiftRole;
  date: string;
  notes: string;
  repeat: boolean;
  until: string;
  weekdays: number[];
}

const initial = (date: string): FormState => ({
  templateId: '',
  userId: '',
  role: 'OPERATOR',
  date,
  notes: '',
  repeat: false,
  until: date,
  weekdays: [1, 2, 3, 4, 5],
});

/**
 * Put someone on a shift for a day, or on chosen weekdays until a date. Times
 * come from the template, read in the planner's own time zone.
 */
export function ScheduleDialog({ open, onOpenChange, date }: { open: boolean; onOpenChange: (open: boolean) => void; date: string }) {
  const [form, setForm] = useState(() => initial(date));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const templates = useQuery({ ...shiftTemplatesQueryOptions(), enabled: open });
  const users = useQuery({ ...userOptionsQueryOptions(), enabled: open });
  const create = useCreateAssignments();

  useEffect(() => {
    if (open) {
      setForm(initial(date));
      setErrors({});
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateShiftAssignmentSchema.safeParse({
      templateId: form.templateId,
      userId: form.userId,
      role: form.role,
      date: form.date,
      timeZone: browserTimeZone,
      notes: form.notes.trim() || null,
      ...(form.repeat && { repeat: { until: form.until, weekdays: form.weekdays } }),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(parsed.data, { onSuccess: () => onOpenChange(false) });
  };

  const activeTemplates = (templates.data ?? []).filter((template) => template.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Schedule a shift</DialogTitle>
            <DialogDescription>Times come from the shift template, in your time zone ({browserTimeZone}).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
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
                  {activeTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: template.color }} />
                      {template.name} · {template.startTime}, {template.durationMinutes / 60} h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="schedule-role" label="Role">
              <Select value={form.role} onValueChange={(value) => set('role', value as ShiftRole)}>
                <SelectTrigger id="schedule-role" className="w-full">
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
            <Field id="schedule-date" label={form.repeat ? 'From' : 'Date'} error={errors.date}>
              <Input id="schedule-date" type="date" value={form.date} onChange={(event) => set('date', event.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="schedule-repeat" checked={form.repeat} onCheckedChange={(checked) => set('repeat', checked === true)} />
              <Label htmlFor="schedule-repeat">Repeat weekly</Label>
            </div>
            {form.repeat && (
              <>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Weekdays">
                  {WEEKDAYS.map((day) => {
                    const on = form.weekdays.includes(day.value);
                    return (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={on ? 'secondary' : 'outline'}
                        aria-pressed={on}
                        onClick={() =>
                          set('weekdays', on ? form.weekdays.filter((value) => value !== day.value) : [...form.weekdays, day.value])
                        }
                      >
                        {day.label}
                      </Button>
                    );
                  })}
                </div>
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
      </DialogContent>
    </Dialog>
  );
}
