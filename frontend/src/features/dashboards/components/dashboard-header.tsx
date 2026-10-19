import { MoreHorizontal, Pencil, Share2 } from 'lucide-react';
import type { Dashboard } from '@gen-ui/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DashboardGroup } from './dashboard-group';

/**
 * The Dashboard page's header while viewing: which dashboard is open, whether
 * it is shared, and what the user may do with it (only its owner edits it;
 * an admin may also delete a shared one).
 */
export function DashboardHeader({
  dashboards,
  userId,
  selected,
  onOpen,
  onEdit,
  onNew,
  onDelete,
}: {
  dashboards: Dashboard[];
  userId: string | undefined;
  selected: Dashboard | undefined;
  onOpen: (id: string) => void;
  onEdit: () => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const mine = dashboards.filter((item) => item.owner.id === userId);
  const shared = dashboards.filter((item) => item.owner.id !== userId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select value={selected?.id} onValueChange={onOpen}>
          <SelectTrigger className="w-64" aria-label="Dashboard">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <DashboardGroup label="My dashboards" items={mine} />
            <DashboardGroup label="Shared with me" items={shared} />
          </SelectContent>
        </Select>
        {selected?.isShared && (
          <Badge variant="outline" className="gap-1">
            <Share2 className="size-3" />
            Shared{selected.owner.id !== userId && ` by ${selected.owner.name}`}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        {selected?.canEdit && (
          <Button variant="outline" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Dashboard options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onNew}>New dashboard</DropdownMenuItem>
            {selected?.canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete dashboard
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
