import { AssetForm } from '@/features/assets/components/asset-form';
import type { FormProps } from '../../types';

/** The parent goes in as where the asset goes, which also picks its starting type. */
export function CreateAssetBody({ input: { parentId, ...prefill }, disabled, onSaved }: FormProps<'createAsset'>) {
  return (
    <AssetForm
      parentId={parentId ?? undefined}
      prefill={prefill}
      disabled={disabled}
      onSaved={(asset) => onSaved(asset.id)}
    />
  );
}
