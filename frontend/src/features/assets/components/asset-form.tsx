import { useId, useState, type FormEvent } from 'react';
import {
  ASSET_TYPES,
  CreateAssetSchema,
  UpdateAssetSchema,
  type Asset,
  type AssetDetail,
  type AssetPrefill,
  type AssetType,
} from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api/errors';
import { blankToNull, fieldErrors, numberOrNull } from '@/lib/form';
import { ASSET_TYPE } from '@/lib/labels';
import { useSaveAsset } from '../api/mutations';
import { fromAsset, withPrefill, type AssetFormState } from '../lib/asset-form-state';
import { AssetSelect } from './asset-select';

/**
 * The asset form: the dialog's header, fields and button. The pages show it
 * in `AssetFormDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), with `prefill` over the asset's values (or the
 * defaults), each changed value hinting what it was. Either way it sits
 * inside a `Dialog`, which its title and description need.
 */
export function AssetForm({
  asset,
  parentId,
  prefill,
  disabled = false,
  onSaved,
}: {
  asset?: Asset;
  /** Where a new asset goes; it also picks the starting type (equipment under a parent, a site at the top). */
  parentId?: string;
  prefill?: AssetPrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (asset: AssetDetail) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => withPrefill(fromAsset(asset, parentId), prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveAsset();

  const set = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // When editing, a value the assistant changed says what it was.
  const before = asset && fromAsset(asset);
  const was = (key: keyof AssetFormState, show: (value: string) => string = (value) => value || 'empty') =>
    before && prefill?.[key] !== undefined && withPrefill(before, prefill)[key] !== before[key]
      ? `Was ${show(String(before[key] ?? ''))}`
      : undefined;
  const activeWas = was('isActive', (value) => (value === 'true' ? 'in service' : 'out of service'));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      parentId: form.parentId ?? null,
      code: form.code,
      name: form.name,
      type: form.type,
      description: blankToNull(form.description),
      address: blankToNull(form.address),
      latitude: numberOrNull(form.latitude),
      longitude: numberOrNull(form.longitude),
      isActive: form.isActive,
    };
    const parsed = asset ? UpdateAssetSchema.safeParse(values) : CreateAssetSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: asset?.id, input: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{asset ? `Edit ${asset.name}` : 'New asset'}</DialogTitle>
        <DialogDescription>
          {asset ? 'Choosing another parent moves this asset together with everything below it.' : 'Regions hold sites, sites hold areas and equipment.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-name`} label="Name" hint={was('name')} error={errors.name}>
          <Input id={`${id}-name`} value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field id={`${id}-code`} label="Code" hint={was('code') ?? 'Unique, e.g. PS-03'} error={errors.code}>
          <Input id={`${id}-code`} value={form.code} onChange={(event) => set('code', event.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-type`} label="Type" hint={was('type', (value) => ASSET_TYPE[value as AssetType].label)}>
          <Select value={form.type} onValueChange={(value) => set('type', value as AssetType)}>
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ASSET_TYPE[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          id={`${id}-parent`}
          label="Parent"
          hint={was('parentId', () => asset?.parent?.name ?? 'top level')}
          error={errors.parentId}
        >
          <AssetSelect
            id={`${id}-parent`}
            value={form.parentId}
            onChange={(value) => set('parentId', value)}
            allLabel={null}
            noneLabel="None (top level)"
            exclude={asset?.id}
            className="w-full"
          />
        </Field>
      </div>
      <Field
        id={`${id}-description`}
        label="Description"
        hint={was('description', (value) => (value ? `“${value}”` : 'empty'))}
        error={errors.description}
      >
        <Textarea id={`${id}-description`} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </Field>
      <Field id={`${id}-address`} label="Address" hint={was('address')} error={errors.address}>
        <Input id={`${id}-address`} value={form.address} onChange={(event) => set('address', event.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-lat`} label="Latitude" hint={was('latitude')} error={errors.latitude && 'Between -90 and 90'}>
          <Input id={`${id}-lat`} type="number" step="any" value={form.latitude} onChange={(event) => set('latitude', event.target.value)} />
        </Field>
        <Field id={`${id}-lng`} label="Longitude" hint={was('longitude')} error={errors.longitude && 'Between -180 and 180'}>
          <Input id={`${id}-lng`} type="number" step="any" value={form.longitude} onChange={(event) => set('longitude', event.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`${id}-active`} checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
        <Label htmlFor={`${id}-active`}>In service</Label>
        {activeWas && <span className="text-xs text-muted-foreground">{activeWas}</span>}
      </div>
      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : asset ? 'Save' : 'Create asset'}
        </Button>
      </DialogFooter>
    </form>
  );
}
