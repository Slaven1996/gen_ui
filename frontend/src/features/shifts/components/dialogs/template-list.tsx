import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { templateTimes, type ShiftTemplate } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useDeleteTemplate, useSaveTemplate } from '../../api/mutations';
import { shiftTemplatesQueryOptions } from '../../api/queries';
import { coverageSummary } from '../../lib/calendar-utils';
import { TemplateForm } from './template-form';

/** Every shift template, each with its form to edit and a delete. */
export function TemplateList() {
  const templates = useQuery(shiftTemplatesQueryOptions());
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ShiftTemplate | null>(null);

  if (editing) {
    return (
      <TemplateForm
        template={editing === 'new' ? undefined : editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {templates.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="divide-y rounded-md border">
          {templates.data?.map((template) => {
            const times = templateTimes(template);
            return (
              <li key={template.id} className="flex items-center gap-3 px-3 py-2">
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: template.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {template.name}
                    {!template.isActive && <span className="font-normal text-muted-foreground"> (inactive)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {times.label}
                    {times.overnight && ' (next day)'}
                    {template.coverage.length > 0 && ` · ${coverageSummary(template.coverage)}`}
                  </div>
                </div>
                <Switch
                  checked={template.isActive}
                  onCheckedChange={(isActive) => save.mutate({ id: template.id, input: { isActive } })}
                  aria-label={`${template.isActive ? 'Deactivate' : 'Activate'} ${template.name}`}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${template.name}`} onClick={() => setEditing(template)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${template.name}`}
                  onClick={() => setDeleting(template)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
        <Plus />
        New template
      </Button>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Only a template that was never scheduled can be deleted. For one that was, switch it off instead."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </div>
  );
}
