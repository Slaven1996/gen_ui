import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSET_TYPE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { assetTreeQueryOptions } from '../api/queries';

const ALL = '__all__';
const NONE = '__none__';

/**
 * Pick an asset from the whole tree, indented by depth. As a filter, choosing
 * an asset means "it and everything below it" — the API's `assetId` semantics.
 */
export function AssetSelect({
  value,
  onChange,
  allLabel = 'All assets',
  noneLabel,
  placeholder = 'Choose an asset',
  id,
  className,
  exclude,
}: {
  value: string | null | undefined;
  onChange: (value: string | undefined) => void;
  /** Label of the "no filter" entry; pass `null` to leave it out (forms). */
  allLabel?: string | null;
  /** For optional form fields: an explicit "none" entry that maps to `undefined`. */
  noneLabel?: string;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Hide this asset and its subtree (can't move an asset below itself). */
  exclude?: string;
}) {
  const tree = useQuery(assetTreeQueryOptions());

  let hiddenDepth: number | null = null;
  const nodes = (tree.data ?? []).filter((node) => {
    if (hiddenDepth !== null && node.depth > hiddenDepth) return false;
    hiddenDepth = null;
    if (node.id === exclude) {
      hiddenDepth = node.depth;
      return false;
    }
    return true;
  });

  const empty = allLabel ? ALL : noneLabel ? NONE : '';

  return (
    <Select
      value={value ?? empty}
      onValueChange={(next) => onChange(next === ALL || next === NONE ? undefined : next)}
      disabled={tree.isPending}
    >
      <SelectTrigger id={id} className={cn('w-52', className)} aria-label={allLabel ?? placeholder}>
        <SelectValue placeholder={tree.isPending ? 'Loading assets…' : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {nodes.map((node) => {
          const Icon = ASSET_TYPE[node.type].icon;
          return (
            <SelectItem key={node.id} value={node.id}>
              <span className="flex items-center gap-1.5" style={{ paddingLeft: `${node.depth * 0.875}rem` }}>
                <Icon className="size-3.5 text-muted-foreground" />
                {node.name}
                <span className="text-xs text-muted-foreground">{node.code}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
