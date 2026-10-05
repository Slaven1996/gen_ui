import { useId, useState, type FormEvent } from 'react';
import {
  ALARM_SEVERITIES,
  CreateAlarmDefinitionSchema,
  UpdateAlarmDefinitionSchema,
  type AlarmCondition,
  type AlarmDefinition,
  type AlarmSeverity,
  type RulePrefill,
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { TagPicker } from '@/features/tags/tag-picker';
import { getErrorMessage } from '@/lib/api/errors';
import { ALARM_CONDITION_OPTIONS, SEVERITY } from '@/lib/labels';
import { useSaveAlarmDefinition } from './api';

interface FormState {
  tagId: string;
  name: string;
  description: string;
  condition: AlarmCondition;
  threshold: string;
  deadband: string;
  severity: AlarmSeverity;
  isEnabled: boolean;
}

const fromDefinition = (definition?: AlarmDefinition, tagId?: string): FormState => ({
  tagId: definition?.tagId ?? tagId ?? '',
  name: definition?.name ?? '',
  description: definition?.description ?? '',
  condition: definition?.condition ?? 'ABOVE',
  threshold: definition ? String(definition.threshold) : '',
  deadband: definition ? String(definition.deadband) : '0',
  severity: definition?.severity ?? 'MEDIUM',
  isEnabled: definition?.isEnabled ?? true,
});

/** `form`, with the values the assistant filled in put over it. */
const withPrefill = (form: FormState, prefill: RulePrefill = {}): FormState => ({
  ...form,
  name: prefill.name ?? form.name,
  description: prefill.description ?? form.description,
  condition: prefill.condition ?? form.condition,
  threshold: prefill.threshold === undefined ? form.threshold : String(prefill.threshold),
  deadband: prefill.deadband === undefined ? form.deadband : String(prefill.deadband),
  severity: prefill.severity ?? form.severity,
  isEnabled: prefill.isEnabled ?? form.isEnabled,
});

/** Create a rule, or edit one (`definition`). A rule's tag is fixed once created. */
export function DefinitionFormDialog({
  open,
  onOpenChange,
  definition,
  initialTagId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition?: AlarmDefinition;
  initialTagId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the rule it opens on. */}
        <DefinitionForm definition={definition} initialTagId={initialTagId} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The alarm rule form: the dialog's header, fields and button. The pages show
 * it in `DefinitionFormDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), with `prefill` over the rule's values (or the defaults),
 * each changed value hinting what it was. Either way it sits inside a
 * `Dialog`, which its title and description need.
 */
export function DefinitionForm({
  definition,
  initialTagId,
  prefill,
  disabled = false,
  onSaved,
}: {
  definition?: AlarmDefinition;
  initialTagId?: string;
  prefill?: RulePrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (definition: AlarmDefinition) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => withPrefill(fromDefinition(definition, initialTagId), prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveAlarmDefinition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // When editing, a value the assistant changed says what it was.
  const before = definition && fromDefinition(definition);
  const was = (key: Exclude<keyof FormState, 'tagId'>, show: (value: string) => string = (value) => value) =>
    before && prefill?.[key] !== undefined && withPrefill(before, prefill)[key] !== before[key]
      ? `Was ${show(String(before[key]))}`
      : undefined;
  const conditionLabel = (value: string) =>
    ALARM_CONDITION_OPTIONS.find((option) => option.value === value)?.label ?? value;
  const enabledWas = was('isEnabled', (value) => (value === 'true' ? 'on' : 'off'));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      name: form.name,
      description: form.description.trim() || null,
      condition: form.condition,
      threshold: form.threshold === '' ? Number.NaN : Number(form.threshold),
      deadband: form.deadband === '' ? 0 : Number(form.deadband),
      severity: form.severity,
      isEnabled: form.isEnabled,
    };
    const parsed = definition
      ? UpdateAlarmDefinitionSchema.safeParse(values)
      : CreateAlarmDefinitionSchema.safeParse({ ...values, tagId: form.tagId });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: definition?.id, input: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{definition ? 'Edit alarm rule' : 'New alarm rule'}</DialogTitle>
        <DialogDescription>
          Every new reading of the tag is compared with the threshold. The alarm clears once the value is back past
          the threshold by the deadband.
        </DialogDescription>
      </DialogHeader>

      <Field id={`${id}-tag`} label="Tag" error={errors.tagId}>
        <TagPicker
          id={`${id}-tag`}
          value={form.tagId ? [form.tagId] : []}
          onChange={(ids) => set('tagId', ids[0] ?? '')}
          max={1}
          placeholder="Choose the tag to watch"
          className="w-full"
          disabled={Boolean(definition)}
        />
      </Field>
      <Field id={`${id}-name`} label="Name" hint={was('name')} error={errors.name}>
        <Input id={`${id}-name`} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Wet well high level" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id={`${id}-condition`} label="Condition" hint={was('condition', conditionLabel)}>
          <Select value={form.condition} onValueChange={(value) => set('condition', value as AlarmCondition)}>
            <SelectTrigger id={`${id}-condition`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALARM_CONDITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-threshold`} label="Threshold" hint={was('threshold')} error={errors.threshold && 'Enter a number'}>
          <Input id={`${id}-threshold`} type="number" step="any" value={form.threshold} onChange={(event) => set('threshold', event.target.value)} />
        </Field>
        <Field id={`${id}-deadband`} label="Deadband" hint={was('deadband')} error={errors.deadband && 'Zero or more'}>
          <Input id={`${id}-deadband`} type="number" step="any" min={0} value={form.deadband} onChange={(event) => set('deadband', event.target.value)} />
        </Field>
      </div>
      <Field id={`${id}-severity`} label="Severity" hint={was('severity', (value) => SEVERITY[value as AlarmSeverity].label)}>
        <Select value={form.severity} onValueChange={(value) => set('severity', value as AlarmSeverity)}>
          <SelectTrigger id={`${id}-severity`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALARM_SEVERITIES.map((severity) => {
              const { icon: Icon, label } = SEVERITY[severity];
              return (
                <SelectItem key={severity} value={severity}>
                  <Icon className="text-muted-foreground" />
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id={`${id}-description`}
        label="Description"
        hint={was('description', (value) => (value ? `“${value}”` : 'empty')) ?? 'What an operator should know or do.'}
        error={errors.description}
      >
        <Textarea id={`${id}-description`} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Switch id={`${id}-enabled`} checked={form.isEnabled} onCheckedChange={(checked) => set('isEnabled', checked)} />
        <Label htmlFor={`${id}-enabled`}>Enabled</Label>
        {enabledWas && <span className="text-xs text-muted-foreground">{enabledWas}</span>}
      </div>

      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : definition ? 'Save rule' : 'Create rule'}
        </Button>
      </DialogFooter>
    </form>
  );
}
