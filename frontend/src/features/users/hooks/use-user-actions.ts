import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/auth-store';
import { useUpdateUser } from '../api/mutations';
import type { UserActions } from '../types';

/**
 * Row actions for admins, wherever the table is shown: the Users page or an
 * assistant answer. Everyone else gets a read-only table. The API enforces
 * the same rule (changing a user is admin-only); this only decides what to show.
 */
export function useUserActions(): UserActions | undefined {
  const { user } = useAuth();
  const { mutate } = useUpdateUser();
  const adminId = user?.role === 'ADMIN' ? user.id : undefined;
  return useMemo<UserActions | undefined>(
    () =>
      adminId
        ? { currentUserId: adminId, onUpdate: (target, patch) => mutate({ id: target.id, patch }) }
        : undefined,
    [adminId, mutate],
  );
}
