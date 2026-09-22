import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { AssetTreeNode } from '@gen-ui/shared';
import { StatusDot } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ASSET_TYPE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { assetTreeQueryOptions } from './api';

interface TreeItem {
  node: AssetTreeNode;
  children: TreeItem[];
}

function buildTree(nodes: AssetTreeNode[]): TreeItem[] {
  const items = new Map(nodes.map((node) => [node.id, { node, children: [] as TreeItem[] }]));
  const roots: TreeItem[] = [];
  for (const item of items.values()) {
    const parent = item.node.parentId ? items.get(item.node.parentId) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  return roots;
}

/**
 * The asset hierarchy as a navigable tree. Each node shows the open alarms of
 * its whole subtree, so trouble is visible from the top level down.
 */
export function AssetTree({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string | undefined) => void }) {
  const tree = useQuery(assetTreeQueryOptions());
  const roots = useMemo(() => buildTree(tree.data ?? []), [tree.data]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (tree.isPending) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-6" />
        ))}
      </div>
    );
  }

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderItem = (item: TreeItem) => {
    const { node } = item;
    const Icon = ASSET_TYPE[node.type].icon;
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id} role="treeitem" aria-expanded={item.children.length ? open : undefined} aria-selected={selectedId === node.id}>
        <div
          className={cn(
            'group flex items-center gap-1 rounded-md pr-2 text-sm hover:bg-accent',
            selectedId === node.id && 'bg-accent font-medium',
            !node.isActive && 'text-muted-foreground',
          )}
        >
          <button
            type="button"
            className={cn('flex size-6 shrink-0 items-center justify-center rounded', !item.children.length && 'invisible')}
            onClick={() => toggle(node.id)}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left" onClick={() => onSelect(node.id)}>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{node.name}</span>
          </button>
          {node.openAlarmCount > 0 && (
            <span className="flex items-center gap-1 text-xs tabular-nums" title={`${node.openAlarmCount} open alarms here or below`}>
              <StatusDot tone="critical" />
              {node.openAlarmCount}
              <span className="sr-only">open alarms</span>
            </span>
          )}
        </div>
        {open && item.children.length > 0 && (
          <ul role="group" className="ml-3 border-l pl-1">
            {item.children.map(renderItem)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav aria-label="Asset tree">
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={cn('mb-1 w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent', !selectedId && 'bg-accent font-medium')}
      >
        All assets
      </button>
      <ul role="tree">{roots.map(renderItem)}</ul>
    </nav>
  );
}
