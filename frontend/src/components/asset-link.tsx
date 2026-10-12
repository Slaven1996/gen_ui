import { Link } from '@tanstack/react-router';

/** An asset's name as a link to its page; the click stays out of the row's own handler. */
export function AssetLink({ asset }: { asset: { id: string; name: string; code: string } }) {
  return (
    <Link
      to="/assets/$assetId"
      params={{ assetId: asset.id }}
      className="text-sm hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {asset.name}
    </Link>
  );
}
