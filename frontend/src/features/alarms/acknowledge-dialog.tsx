import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAcknowledgeAlarms } from './api';

/** Acknowledge one or many alarms, with an optional note kept on each and in the logbook. */
export function AcknowledgeDialog({
  ids,
  open,
  onOpenChange,
  onDone,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [note, setNote] = useState('');
  const acknowledge = useAcknowledgeAlarms();
  const count = ids.length;

  const submit = () =>
    acknowledge.mutate(
      { ids, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setNote('');
          onOpenChange(false);
          onDone?.();
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acknowledge {count === 1 ? 'alarm' : `${count} alarms`}</DialogTitle>
          <DialogDescription>
            Acknowledging records that you have seen it. It does not clear the condition — that happens when the value
            returns to normal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ack-note">Note (optional)</Label>
          <Textarea
            id="ack-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Crew dispatched"
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={acknowledge.isPending || count === 0}>
            {acknowledge.isPending ? 'Acknowledging…' : 'Acknowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
