import { useEffect, useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { ConfirmDialog } from '@/components/confirm-dialog';

/**
 * Asks before leaving while `dirty`: another page of the app (or another
 * search on this one) gets a "Leave without saving?" dialog, and closing or
 * reloading the tab gets the browser's own prompt. Call `release()` right
 * before navigating away on purpose (after a save, or Cancel), since the new
 * `dirty` only arrives with the next render.
 */
export function useUnsavedChanges(dirty: boolean, what = 'your changes') {
  const blocking = useRef(dirty);
  useEffect(() => {
    blocking.current = dirty;
  }, [dirty]);
  const blocker = useBlocker({
    shouldBlockFn: () => blocking.current,
    enableBeforeUnload: () => blocking.current,
    withResolver: true,
  });

  return {
    release: () => {
      blocking.current = false;
    },
    dialog: (
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="Leave without saving?"
        description={`If you leave now, ${what} will be lost.`}
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
      />
    ),
  };
}
