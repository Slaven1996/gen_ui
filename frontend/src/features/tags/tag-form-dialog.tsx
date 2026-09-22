import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreateTagSchema, TAG_DATA_TYPES, UpdateTagSchema, type Tag, type TagDataType } from '@gen-ui/shared';
import { blankToNull, Field, fieldErrors, numberOrNull } from '@/components/form/field';
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
import { devicesListQueryOptions, useSaveTag } from '@/features/assets/api';
import { getErrorMessage } from '@/lib/api/errors';
import { TAG_DATA_TYPE } from '@/lib/labels';

interface FormState {
  deviceId: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  dataType: TagDataType;
  minValue: string;
  maxValue: string;
  logIntervalSeconds: string;
  isActive: boolean;
}

const fromTag = (tag?: Tag, deviceId?: string): FormState => ({
  deviceId: tag?.deviceId ?? deviceId ?? '',
  code: tag?.code ?? '',
  name: tag?.name ?? '',
  description: tag?.description ?? '',
  unit: tag?.unit ?? '',
  dataType: tag?.dataType ?? 'ANALOG',
  minValue: tag?.minValue?.toString() ?? '',
  maxValue: tag?.maxValue?.toString() ?? '',
  logIntervalSeconds: String(tag?.logIntervalSeconds ?? 60),
  isActive: tag?.isActive ?? true,
});

/** Create a tag on a device, or edit one. A tag cannot move to another device. */
export function TagFormDialog({
  open,
  onOpenChange,
  tag,
  deviceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag;
  deviceId?: string;
}) {
  const [form, setForm] = useState(() => fromTag(tag, deviceId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveTag();
  const devices = useQuery({ ...devicesListQueryOptions({ pageSize: 100 }), enabled: open && !tag });

  useEffect(() => {
    if (open) {
      setForm(fromTag(tag, deviceId));
      setErrors({});
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, tag?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

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
    save.mutate({ id: tag?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            <Field id="tag-device" label="Device" error={errors.deviceId && 'Choose a device'}>
              <Select value={form.deviceId} onValueChange={(value) => set('deviceId', value)}>
                <SelectTrigger id="tag-device" className="w-full">
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
            <Field id="tag-name" label="Name" error={errors.name}>
              <Input id="tag-name" value={form.name} onChange={(event) => set('name', event.target.value)} />
            </Field>
            <Field id="tag-code" label="Code" hint="Unique on the device" error={errors.code}>
              <Input id="tag-code" value={form.code} onChange={(event) => set('code', event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field id="tag-type" label="Type">
              <Select value={form.dataType} onValueChange={(value) => set('dataType', value as TagDataType)}>
                <SelectTrigger id="tag-type" className="w-full">
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
            <Field id="tag-unit" label="Unit" error={errors.unit}>
              <Input id="tag-unit" value={form.unit} onChange={(event) => set('unit', event.target.value)} placeholder="e.g. m³/h" />
            </Field>
            <Field id="tag-interval" label="Log every (s)" error={errors.logIntervalSeconds && '1 to 86 400'}>
              <Input id="tag-interval" type="number" min={1} value={form.logIntervalSeconds} onChange={(event) => set('logIntervalSeconds', event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="tag-min" label="Range minimum" error={errors.minValue}>
              <Input id="tag-min" type="number" step="any" value={form.minValue} onChange={(event) => set('minValue', event.target.value)} />
            </Field>
            <Field id="tag-max" label="Range maximum" error={errors.maxValue}>
              <Input id="tag-max" type="number" step="any" value={form.maxValue} onChange={(event) => set('maxValue', event.target.value)} />
            </Field>
          </div>
          <Field id="tag-description" label="Description" error={errors.description}>
            <Input id="tag-description" value={form.description} onChange={(event) => set('description', event.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Switch id="tag-active" checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
            <Label htmlFor="tag-active">Active</Label>
          </div>
          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : tag ? 'Save' : 'Create tag'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
