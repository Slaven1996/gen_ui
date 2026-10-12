import { useId, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CreateShiftTemplateSchema,
  SHIFT_ROLES,
  UpdateShiftTemplateSchema,
  type ShiftRole,
  type ShiftTemplate,
  type ShiftTemplatePrefill,
} from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { SHIFT_ROLE } from '@/lib/labels';
import { useSaveTemplate } from '../../api/mutations';
import { fromTemplate, rule, staffing, withPrefill, type RuleState, type TemplateFormState } from '../../lib/template-form-state';
import { WeekdayToggles } from './weekday-toggles';

/**
 * A shift template: its name, hours, colour, whether it can be scheduled, and
 * its staffing target — who it needs on which days. The calendar marks a day
 * where the target isn't met. `TemplatesDialog` shows it in place of its list
 * (`heading="label"`); the assistant shows it inside an answer
 * (`InlineDialog`, `heading="dialog"`), with `prefill` over the template's
 * values (or the defaults), each changed value hinting what it was.
 */
export function TemplateForm({
  template,
  prefill,
  heading = 'label',
  disabled = false,
  onSaved,
  onCancel,
}: {
  template?: ShiftTemplate;
  prefill?: ShiftTemplatePrefill;
  /** `dialog`: the dialog's own title, where nothing around the form gives one. */
  heading?: 'label' | 'dialog';
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (template: ShiftTemplate) => void;
  /** Shows a Cancel button; without it, whatever holds the form closes it. */
  onCancel?: () => void;
}) {
  const id = useId();
  // What the form opened with: the template (or the defaults), with the assistant's values over it.
  const [opened] = useState(() => withPrefill(fromTemplate(template), prefill));
  const [form, setForm] = useState(opened);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveTemplate();

  const set = <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setRule = (key: number, patch: Partial<RuleState>) =>
    set('rules', form.rules.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  // When editing, a value the assistant changed says what it was.
  const before = template && fromTemplate(template);
  const was = (key: Exclude<keyof TemplateFormState, 'rules'>, show: (value: string) => string = (value) => value || 'empty') =>
    before && prefill && opened[key] !== before[key] ? `Was ${show(String(before[key]))}` : undefined;
  const wasStaffing =
    before && prefill?.coverage !== undefined && staffing(opened.rules) !== staffing(before.rules)
      ? `Was ${staffing(before.rules)}`
      : undefined;
  const wasActive = was('isActive', (value) => (value === 'true' ? 'active' : 'switched off'));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      name: form.name,
      startTime: form.startTime,
      durationMinutes: Math.round(Number(form.hours) * 60),
      color: form.color,
      isActive: form.isActive,
      coverage: form.rules.map((item) => ({ role: item.role, weekdays: item.weekdays, headcount: Number(item.headcount) })),
    };
    if (template) {
      const parsed = UpdateShiftTemplateSchema.safeParse(input);
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setErrors({});
      save.mutate({ id: template.id, input: parsed.data }, { onSuccess: onSaved });
    } else {
      const parsed = CreateShiftTemplateSchema.safeParse(input);
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setErrors({});
      save.mutate({ input: parsed.data }, { onSuccess: onSaved });
    }
  };

  const title = template ? `Edit “${template.name}”` : heading === 'dialog' ? 'New shift template' : 'New template';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {heading === 'dialog' ? (
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Hours and staffing apply to shifts scheduled from now on; scheduled ones keep their times.
          </DialogDescription>
        </DialogHeader>
      ) : (
        <p className="text-sm font-medium">{title}</p>
      )}
      <div className="grid grid-cols-[1fr_6.5rem_5.5rem_3.5rem] gap-2">
        <Field id={`${id}-name`} label="Name" error={errors.name} hint={was('name')}>
          <Input id={`${id}-name`} value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field id={`${id}-start`} label="Starts" error={errors.startTime} hint={was('startTime')}>
          <Input id={`${id}-start`} type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} />
        </Field>
        <Field id={`${id}-hours`} label="Hours" error={errors.durationMinutes && '0.25–24'} hint={was('hours', (value) => `${value} h`)}>
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
        <Field id={`${id}-color`} label="Colour" hint={was('color')}>
          <Input id={`${id}-color`} type="color" className="p-1" value={form.color} onChange={(event) => set('color', event.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Switch id={`${id}-active`} checked={form.isActive} onCheckedChange={(isActive) => set('isActive', isActive)} />
        <Label htmlFor={`${id}-active`}>Active</Label>
        <span className="text-xs text-muted-foreground">
          {wasActive ?? (form.isActive ? 'People can be scheduled on it.' : 'Past shifts keep it; nobody can be scheduled on it.')}
        </span>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Staffing</legend>
        <p className="text-xs text-muted-foreground">
          {wasStaffing ?? 'Who this shift needs, on the days it starts. Without any, it runs daily and is never marked short.'}
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
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : template ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
