import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { Tag } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DefinitionFormDialog } from '@/features/alarms/components/definition-form-dialog';
import { useAuth } from '@/lib/auth/auth-store';
import { useDeleteTag } from '../api/mutations';
import { TagFormDialog } from '../components/tag-form-dialog';
import type { TagActions } from '../types';

/**
 * Row actions wherever the full table is shown: the Tags page or an
 * assistant answer. Everyone can chart a tag; admins can also add an alarm
 * rule, edit and delete, with their own dialogs. Compact embeds (an asset's
 * page) get a read-only table. The API enforces the same rules; this only
 * decides what to show.
 */
export function useTagActions(enabled: boolean): { actions: TagActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const isAdmin = enabled && user?.role === 'ADMIN';
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [ruleFor, setRuleFor] = useState<Tag | null>(null);
  const remove = useDeleteTag();

  const actions = useMemo<TagActions | undefined>(
    () =>
      enabled
        ? {
            onChart: (tag) => navigate({ to: '/graphs', search: { tagIds: [tag.id] } }),
            ...(isAdmin && { onAddRule: setRuleFor, onEdit: setEditing, onDelete: setDeleting }),
          }
        : undefined,
    [enabled, isAdmin, navigate],
  );

  const dialogs = isAdmin && (
    <>
      <TagFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} tag={editing ?? undefined} />
      <DefinitionFormDialog open={ruleFor !== null} onOpenChange={(open) => !open && setRuleFor(null)} initialTagId={ruleFor?.id} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its readings are deleted too. Tags with alarm rules or alarm history can't be deleted — deactivate them instead."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}
