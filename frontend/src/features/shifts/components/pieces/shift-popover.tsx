import { useState, type ReactElement } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ShiftActions } from '../../types';
import { ShiftDetails } from './shift-details';

/** Everything about one shift, opened from wherever the calendar shows it. Admins also get Edit and Remove. */
export function ShiftPopover({
  shift,
  timeZone,
  actions,
  children,
}: {
  shift: ShiftAssignment;
  timeZone: string;
  actions?: ShiftActions;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: (shift: ShiftAssignment) => void) => () => {
    setOpen(false);
    action(shift);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <ShiftDetails shift={shift} timeZone={timeZone} />
        {actions && (
          <div className="mt-3 flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={run(actions.remove)}>
              <Trash2 />
              Remove
            </Button>
            <Button variant="outline" size="sm" onClick={run(actions.edit)}>
              <Pencil />
              Edit
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
