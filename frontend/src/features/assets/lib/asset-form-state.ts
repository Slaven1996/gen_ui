import type { Asset, AssetPrefill, AssetType } from '@gen-ui/shared';

export interface AssetFormState {
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

export const fromAsset = (asset?: Asset, parentId?: string): AssetFormState => ({
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

/** `form`, with the values the assistant filled in put over it. */
export const withPrefill = (form: AssetFormState, prefill: AssetPrefill = {}): AssetFormState => ({
  ...form,
  // null: the top of the tree.
  parentId: prefill.parentId === undefined ? form.parentId : (prefill.parentId ?? undefined),
  code: prefill.code ?? form.code,
  name: prefill.name ?? form.name,
  type: prefill.type ?? form.type,
  description: prefill.description ?? form.description,
  address: prefill.address ?? form.address,
  latitude: prefill.latitude === undefined ? form.latitude : String(prefill.latitude),
  longitude: prefill.longitude === undefined ? form.longitude : String(prefill.longitude),
  isActive: prefill.isActive ?? form.isActive,
});
