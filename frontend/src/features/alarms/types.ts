import type { AlarmDefinition } from '@gen-ui/shared';

/** Admin row actions; without them the table is read-only. */
export interface DefinitionActions {
  onEdit: (definition: AlarmDefinition) => void;
  onDelete: (definition: AlarmDefinition) => void;
  onToggle: (definition: AlarmDefinition, isEnabled: boolean) => void;
}
