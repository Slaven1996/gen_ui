import type { AlarmDefinition } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DefinitionForm } from './definition-form';

/** Create a rule, or edit one (`definition`). A rule's tag is fixed once created. */
export function DefinitionFormDialog({
  open,
  onOpenChange,
  definition,
  initialTagId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition?: AlarmDefinition;
  initialTagId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the rule it opens on. */}
        <DefinitionForm definition={definition} initialTagId={initialTagId} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
