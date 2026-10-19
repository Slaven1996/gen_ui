import { useId } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { DashboardDraft } from '../types';

/**
 * The Dashboard page's header while editing: the name and sharing are fields
 * of the dashboard being edited, saved with its widgets in one request.
 * `attention` says what keeps Save off ("2 widgets need attention").
 */
export function DashboardEditHeader({
  draft,
  attention,
  saving,
  onChange,
  onAddWidget,
  onCancel,
  onSave,
}: {
  draft: DashboardDraft;
  attention: string | undefined;
  saving: boolean;
  onChange: (patch: Partial<DashboardDraft>) => void;
  onAddWidget: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <Input
          aria-label="Dashboard name"
          placeholder="Name the dashboard"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          maxLength={80}
          autoFocus={!draft.id}
          className="w-64"
        />
        <div className="flex items-center gap-2">
          <Switch id={`${id}-shared`} checked={draft.isShared} onCheckedChange={(isShared) => onChange({ isShared })} />
          <Label htmlFor={`${id}-shared`}>Share with everyone</Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {attention && <p className="text-sm text-muted-foreground">{attention}</p>}
        <Button variant="outline" onClick={onAddWidget}>
          <Plus />
          Add widget
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving || attention !== undefined}>
          <Check />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
