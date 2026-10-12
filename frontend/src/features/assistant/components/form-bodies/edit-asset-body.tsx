import { useQuery } from '@tanstack/react-query';
import { assetQueryOptions } from '@/features/assets/api/queries';
import { AssetForm } from '@/features/assets/components/asset-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The asset as it is now, with Claude's changes over it. */
export function EditAssetBody({ input, disabled, onSaved }: FormProps<'editAsset'>) {
  const asset = useQuery(assetQueryOptions(input.assetId));
  return (
    <WhenLoaded query={asset}>
      {(current) => (
        <AssetForm asset={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}
