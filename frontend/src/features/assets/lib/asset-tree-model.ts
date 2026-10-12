import type { AssetTreeNode } from '@gen-ui/shared';

export interface TreeItem {
  node: AssetTreeNode;
  children: TreeItem[];
}

/** The flat tree rows nested by parentId. */
export function buildTree(nodes: AssetTreeNode[]): TreeItem[] {
  const items = new Map(nodes.map((node) => [node.id, { node, children: [] as TreeItem[] }]));
  const roots: TreeItem[] = [];
  for (const item of items.values()) {
    const parent = item.node.parentId ? items.get(item.node.parentId) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  return roots;
}
