import { useNavigate } from '@tanstack/react-router';
import { ListAssetsQuerySchema } from '@gen-ui/shared';
import { AssetsTable } from '@/features/assets/components/assets-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Assets page's own table: a click opens the asset's page; edit and delete for admins. */
export function AssetsBody({ input }: { input: ToolInput<'listAssets'> }) {
  const navigate = useNavigate();
  return (
    <AssetsTable
      query={ListAssetsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })}
      dense
      onAssetClick={(asset) => navigate({ to: '/assets/$assetId', params: { assetId: asset.id } })}
    />
  );
}

