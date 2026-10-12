import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TemplateList } from './template-list';

/** The shifts people are scheduled on. A template that has been scheduled can be deactivated, not deleted. */
export function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Shift templates</DialogTitle>
          <DialogDescription>
            Hours and staffing apply to shifts scheduled from now on; scheduled ones keep their times.
          </DialogDescription>
        </DialogHeader>
        <TemplateList />
      </DialogContent>
    </Dialog>
  );
}
