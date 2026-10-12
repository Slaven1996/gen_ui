import type { LogbookEntry } from '@gen-ui/shared';

export interface EntryActions {
  /** Whether the current user may edit / delete this entry. */
  canEdit: (entry: LogbookEntry) => boolean;
  canDelete: (entry: LogbookEntry) => boolean;
  onEdit: (entry: LogbookEntry) => void;
  onDelete: (entry: LogbookEntry) => void;
}
