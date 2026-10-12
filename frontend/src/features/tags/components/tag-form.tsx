import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreateTagSchema, TAG_DATA_TYPES, UpdateTagSchema, type Tag, type TagDataType, type TagPrefill } from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { devicesListQueryOptions } from '@/features/devices/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { blankToNull, fieldErrors, numberOrNull } from '@/lib/form';
import { TAG_DATA_TYPE } from '@/lib/labels';
import { useSaveTag } from '../api/mutations';
import { fromTag, withPrefill, type TagFormState } from '../lib/tag-form-state';

/**
 * The tag form: the dialog's header, fields and button. The pages show it in
 * `TagFormDialog`; the assistant shows it inside an answer (`InlineDialog`),
 * with `prefill` over the tag's values (or the defaults), each changed value
 * hinting what it was. Either way it sits inside a `Dialog`, which its title
 * and description need.
 */
export function TagForm({
  tag,
  deviceId,
  prefill,
  disabled = false,
  onSaved,
}: {
  tag?: Tag;
  deviceId?: string;
  prefill?: TagPrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (tag: Tag) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => withPrefill(fromTag(tag, deviceId), prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveTag();
  const devices = useQuery({ ...devicesListQueryOptions({ pageSize: 100 }), enabled: !tag });

  const set = <K extends keyof TagFormState>(key: K, value: TagFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // When editing, a value the assistant changed says what it was.
  const before = tag && fromTag(tag);
  const was = (key: Exclude<keyof TagFormState, 'deviceId'>, show: (value: string) => string = (value) => value || 'empty') =>
    before && prefill?.[key] !== undefined && withPrefill(before, prefill)[key] !== before[key]
      ? `Was ${show(String(before[key]))}`
      : undefined;
  const activeWas = was('isActive', (value) => (value === 'true' ? 'on' : 'off'));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      code: form.code,
      name: form.name,
      description: blankToNull(form.description),
      unit: blankToNull(form.unit),
      dataType: form.dataType,
      minValue: numberOrNull(form.minValue),
      maxValue: numberOrNull(form.maxValue),
      logIntervalSeconds: Number(form.logIntervalSeconds),
      isActive: form.isActive,
    };
    const parsed = tag ? UpdateTagSchema.safeParse(values) : CreateTagSchema.safeParse({ ...values, deviceId: form.deviceId });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: tag?.id, input: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{tag ? `Edit ${tag.name}` : 'New tag'}</DialogTitle>
        <DialogDescription>A datapoint the device reports. The range scales chart axes and gauges.</DialogDescription>
      </DialogHeader>
      {tag ? (
        <p className="text-sm text-muted-foreground">
          On {tag.device.name} ({tag.asset.name})
        </p>
      ) : (
        <Field id={`${id}-device`} label="Device" error={errors.deviceId && 'Choose a device'}>
          <Select value={form.deviceId} onValueChange={(value) => set('deviceId', value)}>
            <SelectTrigger id={`${id}-device`} className="w-full">
              <SelectValue placeholder={devices.isPending ? 'Loading devices…' : 'Choose a device'} />
            </SelectTrigger>
            <SelectContent>
              {devices.data?.items.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name} <span className="text-muted-foreground">· {device.asset.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-name`} label="Name" hint={was('name')} error={errors.name}>
          <Input id={`${id}-name`} value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field id={`${id}-code`} label="Code" hint={was('code') ?? 'Unique on the device'} error={errors.code}>
          <Input id={`${id}-code`} value={form.code} onChange={(event) => set('code', event.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field id={`${id}-type`} label="Type" hint={was('dataType', (value) => TAG_DATA_TYPE[value as TagDataType])}>
          <Select value={form.dataType} onValueChange={(value) => set('dataType', value as TagDataType)}>
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAG_DATA_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TAG_DATA_TYPE[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-unit`} label="Unit" hint={was('unit')} error={errors.unit}>
          <Input id={`${id}-unit`} value={form.unit} onChange={(event) => set('unit', event.target.value)} placeholder="e.g. m³/h" />
        </Field>
        <Field id={`${id}-interval`} label="Log every (s)" hint={was('logIntervalSeconds')} error={errors.logIntervalSeconds && '1 to 86 400'}>
          <Input id={`${id}-interval`} type="number" min={1} value={form.logIntervalSeconds} onChange={(event) => set('logIntervalSeconds', event.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-min`} label="Range minimum" hint={was('minValue')} error={errors.minValue}>
          <Input id={`${id}-min`} type="number" step="any" value={form.minValue} onChange={(event) => set('minValue', event.target.value)} />
        </Field>
        <Field id={`${id}-max`} label="Range maximum" hint={was('maxValue')} error={errors.maxValue}>
          <Input id={`${id}-max`} type="number" step="any" value={form.maxValue} onChange={(event) => set('maxValue', event.target.value)} />
        </Field>
      </div>
      <Field
        id={`${id}-description`}
        label="Description"
        hint={was('description', (value) => (value ? `“${value}”` : 'empty'))}
        error={errors.description}
      >
        <Input id={`${id}-description`} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Switch id={`${id}-active`} checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
        <Label htmlFor={`${id}-active`}>Active</Label>
        {activeWas && <span className="text-xs text-muted-foreground">{activeWas}</span>}
      </div>
      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : tag ? 'Save' : 'Create tag'}
        </Button>
      </DialogFooter>
    </form>
  );
}
