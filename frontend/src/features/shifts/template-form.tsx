import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CreateShiftTemplateSchema,
  SHIFT_ROLES,
  UpdateShiftTemplateSchema,
  type ShiftRole,
  type ShiftTemplate,
} from '@gen-ui/shared';
import { Field, fieldErrors } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/api/errors';
import { SHIFT_ROLE } from '@/lib/labels';
import { useSaveTemplate } from './api';
import { WeekdayToggles } from './weekday-toggles';

interface RuleState {
  key: number;
  role: ShiftRole;
  weekdays: number[];
  headcount: string;
}

interface FormState {
  name: string;
  startTime: string;
  hours: string;
  color: string;
  rules: RuleState[];
}

let nextKey = 0;
const rule = (values: Omit<RuleState, 'key'>): RuleState => ({ key: nextKey++, ...values });

const fromTemplate = (template?: ShiftTemplate): FormState => ({
  name: template?.name ?? '',
  startTime: template?.startTime ?? '06:00',
  hours: String((template?.durationMinutes ?? 480) / 60),
  color: template?.color ?? '#3b82f6',
  rules: (template?.coverage ?? []).map((item) => rule({ ...item, headcount: String(item.headcount) })),
});

/**
 * A shift template: its name, hours, colour and staffing target — who it
 * needs on which days. The calendar marks a day where the target isn't met.
 */
export function TemplateForm({ template, onDone }: { template?: ShiftTemplate; onDone: () => void }) {
  const [form, setForm] = useState(() => fromTemplate(template));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveTemplate();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setRule = (key: number, patch: Partial<RuleState>) =>
    set('rules', form.rules.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      name: form.name,
      startTime: form.startTime,
      durationMinutes: Math.round(Number(form.hours) * 60),
      color: form.color,
      coverage: form.rules.map((item) => ({ role: item.role, weekdays: item.weekdays, headcount: Number(item.headcount) })),
    };
    const onSuccess = () => onDone();
    if (template) {
      const parsed = UpdateShiftTemplateSchema.safeParse(input);
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setErrors({});
      save.mutate({ id: template.id, input: parsed.data }, { onSuccess });
    } else {
      const parsed = CreateShiftTemplateSchema.safeParse(input);
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setErrors({});
      save.mutate({ input: parsed.data }, { onSuccess });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm font-medium">{template ? `Edit “${template.name}”` : 'New template'}</p>
      <div className="grid grid-cols-[1fr_6.5rem_5.5rem_3.5rem] gap-2">
        <Field id="template-name" label="Name" error={errors.name}>
          <Input id="template-name" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field id="template-start" label="Starts" error={errors.startTime}>
          <Input id="template-start" type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} />
        </Field>
        <Field id="template-hours" label="Hours" error={errors.durationMinutes && '0.25–24'}>
          <Input
            id="template-hours"
            type="number"
            min={0.25}
            max={24}
            step={0.25}
            value={form.hours}
            onChange={(event) => set('hours', event.target.value)}
          />
        </Field>
        <Field id="template-color" label="Colour">
          <Input id="template-color" type="color" className="p-1" value={form.color} onChange={(event) => set('color', event.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Staffing</legend>
        <p className="text-xs text-muted-foreground">
          Who this shift needs, on the days it starts. Without any, it runs daily and is never marked short.
        </p>
        {form.rules.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <Select value={item.role} onValueChange={(value) => setRule(item.key, { role: value as ShiftRole })}>
              <SelectTrigger className="w-32" aria-label="Role">
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
            <Input
              type="number"
              min={1}
              max={20}
              className="w-16"
              aria-label="How many"
              value={item.headcount}
              onChange={(event) => setRule(item.key, { headcount: event.target.value })}
            />
            <WeekdayToggles label="On" value={item.weekdays} onChange={(weekdays) => setRule(item.key, { weekdays })} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Remove this rule"
              onClick={() => set('rules', form.rules.filter((other) => other.key !== item.key))}
            >
              <X />
            </Button>
          </div>
        ))}
        {errors.coverage && <p className="text-xs text-destructive">{errors.coverage}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('rules', [...form.rules, rule({ role: 'OPERATOR', weekdays: [0, 1, 2, 3, 4, 5, 6], headcount: '1' })])}
        >
          <Plus />
          Add requirement
        </Button>
      </fieldset>

      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : template ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
