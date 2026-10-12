import type { Tag } from '@gen-ui/shared';

/** Row actions: charting for everyone, the rest for admins. Without them the table is read-only. */
export interface TagActions {
  onChart: (tag: Tag) => void;
  onAddRule?: (tag: Tag) => void;
  onEdit?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
}
