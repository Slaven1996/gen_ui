import { useState, type ReactNode } from 'react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { useAuth } from '@/lib/auth/auth-store';
import { EditShiftDialog } from '../components/dialogs/edit-shift-dialog';
import { RemoveShiftDialog } from '../components/dialogs/remove-shift-dialog';
import { ScheduleShiftDialog } from '../components/dialogs/schedule-shift-dialog';
import type { SchedulePrefill, ShiftActions } from '../types';

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
