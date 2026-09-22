import { useEffect, useState, type FormEvent } from 'react';
import {
  ALARM_SEVERITIES,
  CreateAlarmDefinitionSchema,
  UpdateAlarmDefinitionSchema,
  type AlarmCondition,
  type AlarmDefinition,
  type AlarmSeverity,
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
  const [form, setForm] = useState(() => fromDefinition(definition, initialTagId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveAlarmDefinition();

  useEffect(() => {
    if (open) {
      setForm(fromDefinition(definition, initialTagId));
      setErrors({});
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, definition?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

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
    save.mutate({ id: definition?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{definition ? 'Edit alarm rule' : 'New alarm rule'}</DialogTitle>
            <DialogDescription>
              Every new reading of the tag is compared with the threshold. The alarm clears once the value is back past
              the threshold by the deadband.
            </DialogDescription>
          </DialogHeader>

          <Field id="rule-tag" label="Tag" error={errors.tagId}>
            <TagPicker
              id="rule-tag"
              value={form.tagId ? [form.tagId] : []}
              onChange={(ids) => set('tagId', ids[0] ?? '')}
              max={1}
              placeholder="Choose the tag to watch"
              className="w-full"
              disabled={Boolean(definition)}
            />
          </Field>
          <Field id="rule-name" label="Name" error={errors.name}>
            <Input id="rule-name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Wet well high level" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="rule-condition" label="Condition">
              <Select value={form.condition} onValueChange={(value) => set('condition', value as AlarmCondition)}>
                <SelectTrigger id="rule-condition" className="w-full">
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
            <Field id="rule-threshold" label="Threshold" error={errors.threshold && 'Enter a number'}>
              <Input id="rule-threshold" type="number" step="any" value={form.threshold} onChange={(event) => set('threshold', event.target.value)} />
            </Field>
            <Field id="rule-deadband" label="Deadband" error={errors.deadband && 'Zero or more'}>
              <Input id="rule-deadband" type="number" step="any" min={0} value={form.deadband} onChange={(event) => set('deadband', event.target.value)} />
            </Field>
          </div>
          <Field id="rule-severity" label="Severity">
            <Select value={form.severity} onValueChange={(value) => set('severity', value as AlarmSeverity)}>
              <SelectTrigger id="rule-severity" className="w-full">
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
          <Field id="rule-description" label="Description" hint="What an operator should know or do." error={errors.description}>
            <Textarea id="rule-description" value={form.description} onChange={(event) => set('description', event.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Switch id="rule-enabled" checked={form.isEnabled} onCheckedChange={(checked) => set('isEnabled', checked)} />
            <Label htmlFor="rule-enabled">Enabled</Label>
          </div>

          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : definition ? 'Save rule' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
