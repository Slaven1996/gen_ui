import { useEffect, useState, type FormEvent } from 'react';
import { ASSET_TYPES, CreateAssetSchema, UpdateAssetSchema, type Asset, type AssetDetail, type AssetType } from '@gen-ui/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api/errors';
import { ASSET_TYPE } from '@/lib/labels';
import { useSaveAsset } from './api';
import { AssetSelect } from './asset-select';

interface FormState {
  parentId: string | undefined;
  code: string;
  name: string;
  type: AssetType;
  description: string;
  address: string;
  latitude: string;
  longitude: string;
  isActive: boolean;
}

const fromAsset = (asset?: Asset, parentId?: string): FormState => ({
  parentId: asset ? (asset.parentId ?? undefined) : parentId,
  code: asset?.code ?? '',
  name: asset?.name ?? '',
  type: asset?.type ?? (parentId ? 'EQUIPMENT' : 'SITE'),
  description: asset?.description ?? '',
  address: asset?.address ?? '',
  latitude: asset?.latitude?.toString() ?? '',
  longitude: asset?.longitude?.toString() ?? '',
  isActive: asset?.isActive ?? true,
});

/** Create an asset (optionally under `parentId`) or edit one — changing the parent moves its subtree. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  parentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset;
  parentId?: string;
  onSaved?: (asset: AssetDetail) => void;
}) {
  const [form, setForm] = useState(() => fromAsset(asset, parentId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveAsset();

  useEffect(() => {
    if (open) {
      setForm(fromAsset(asset, parentId));
      setErrors({});
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, asset?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

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
    save.mutate(
      { id: asset?.id, input: parsed.data },
      {
        onSuccess: (saved) => {
          onOpenChange(false);
          onSaved?.(saved);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{asset ? `Edit ${asset.name}` : 'New asset'}</DialogTitle>
            <DialogDescription>
              {asset ? 'Choosing another parent moves this asset together with everything below it.' : 'Regions hold sites, sites hold areas and equipment.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field id="asset-name" label="Name" error={errors.name}>
              <Input id="asset-name" value={form.name} onChange={(event) => set('name', event.target.value)} />
            </Field>
            <Field id="asset-code" label="Code" hint="Unique, e.g. PS-03" error={errors.code}>
              <Input id="asset-code" value={form.code} onChange={(event) => set('code', event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="asset-type" label="Type">
              <Select value={form.type} onValueChange={(value) => set('type', value as AssetType)}>
                <SelectTrigger id="asset-type" className="w-full">
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
            <Field id="asset-parent" label="Parent" error={errors.parentId}>
              <AssetSelect
                id="asset-parent"
                value={form.parentId}
                onChange={(value) => set('parentId', value)}
                allLabel={null}
                noneLabel="None (top level)"
                exclude={asset?.id}
                className="w-full"
              />
            </Field>
          </div>
          <Field id="asset-description" label="Description" error={errors.description}>
            <Textarea id="asset-description" value={form.description} onChange={(event) => set('description', event.target.value)} />
          </Field>
          <Field id="asset-address" label="Address" error={errors.address}>
            <Input id="asset-address" value={form.address} onChange={(event) => set('address', event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="asset-lat" label="Latitude" error={errors.latitude && 'Between -90 and 90'}>
              <Input id="asset-lat" type="number" step="any" value={form.latitude} onChange={(event) => set('latitude', event.target.value)} />
            </Field>
            <Field id="asset-lng" label="Longitude" error={errors.longitude && 'Between -180 and 180'}>
              <Input id="asset-lng" type="number" step="any" value={form.longitude} onChange={(event) => set('longitude', event.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="asset-active" checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
            <Label htmlFor="asset-active">In service</Label>
          </div>
          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : asset ? 'Save' : 'Create asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
