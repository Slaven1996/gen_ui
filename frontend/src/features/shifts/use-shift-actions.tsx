import { useState, type ReactNode } from 'react';
import type { ShiftAssignment, ShiftSchedulePrefill } from '@gen-ui/shared';
import { useAuth } from '@/lib/auth/auth-store';
import { EditShiftDialog } from './edit-shift-dialog';
import { RemoveShiftDialog } from './remove-shift-dialog';
import { ScheduleShiftDialog } from './schedule-shift-dialog';

/** What the schedule form opens with from an unfilled slot: a part of what the assistant can fill in. */
export type SchedulePrefill = Pick<ShiftSchedulePrefill, 'date' | 'templateId' | 'role'>;

export interface ShiftActions {
  schedule: (prefill?: SchedulePrefill) => void;
  edit: (shift: ShiftAssignment) => void;
  remove: (shift: ShiftAssignment) => void;
}

/**
 * The calendar's admin actions and their dialogs, wherever the calendar is
 * shown. `actions` is undefined for everyone else, and the views then show
 * shifts read-only.
 */
export function useShiftActions(timeZone: string | undefined): { actions?: ShiftActions; dialogs: ReactNode } {
  const { user } = useAuth();
  const [scheduling, setScheduling] = useState<SchedulePrefill | null>(null);
  const [editing, setEditing] = useState<ShiftAssignment | null>(null);
  const [removing, setRemoving] = useState<ShiftAssignment | null>(null);

  if (user?.role !== 'ADMIN') return { dialogs: null };

  return {
    actions: { schedule: (prefill = {}) => setScheduling(prefill), edit: setEditing, remove: setRemoving },
    dialogs: (
      <>
        <ScheduleShiftDialog
          open={scheduling !== null}
          onOpenChange={(open) => !open && setScheduling(null)}
          prefill={scheduling ?? undefined}
          timeZone={timeZone}
        />
        <EditShiftDialog shift={editing} timeZone={timeZone} onOpenChange={(open) => !open && setEditing(null)} />
        <RemoveShiftDialog shift={removing} timeZone={timeZone} onOpenChange={(open) => !open && setRemoving(null)} />
      </>
    ),
  };
}
