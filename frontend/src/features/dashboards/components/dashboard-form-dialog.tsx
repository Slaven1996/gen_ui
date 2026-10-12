import { useEffect, useState, type FormEvent } from 'react';
import { CreateDashboardSchema, type Dashboard, type DashboardDetail } from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { useCreateDashboard, useUpdateDashboard } from '../api/mutations';

/** Create a dashboard (blank or from the operations template), or rename / share one. */
export function DashboardFormDialog({
  open,
  onOpenChange,
  dashboard,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard?: Dashboard;
  onCreated?: (dashboard: DashboardDetail) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [template, setTemplate] = useState<'blank' | 'operations'>('operations');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDashboard();
  const update = useUpdateDashboard(dashboard?.id ?? '');
  const error = create.error ?? update.error;

  useEffect(() => {
    if (!open) return;
    setName(dashboard?.name ?? '');
    setDescription(dashboard?.description ?? '');
    setIsShared(dashboard?.isShared ?? false);
    setTemplate('operations');
    setErrors({});
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, dashboard?.id]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateDashboardSchema.safeParse({ name, description: description.trim() || null, isShared, template });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (dashboard) {
      const { name: nextName, description: nextDescription, isShared: shared } = parsed.data;
      update.mutate({ name: nextName, description: nextDescription, isShared: shared }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(parsed.data, {
        onSuccess: (created) => {
          onOpenChange(false);
          onCreated?.(created);
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{dashboard ? 'Dashboard settings' : 'New dashboard'}</DialogTitle>
            <DialogDescription>Private by default. Shared dashboards are visible to everyone, read-only.</DialogDescription>
          </DialogHeader>
          <Field id="dashboard-name" label="Name" error={errors.name}>
            <Input id="dashboard-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </Field>
          <Field id="dashboard-description" label="Description" error={errors.description}>
            <Input id="dashboard-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} />
          </Field>
          {!dashboard && (
            <Field id="dashboard-template" label="Start with">
              <Select value={template} onValueChange={(value) => setTemplate(value as 'blank' | 'operations')}>
                <SelectTrigger id="dashboard-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations">Operations overview (KPIs, alarms, trend, on duty)</SelectItem>
                  <SelectItem value="blank">An empty dashboard</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="flex items-center gap-2">
            <Switch id="dashboard-shared" checked={isShared} onCheckedChange={setIsShared} />
            <Label htmlFor="dashboard-shared">Share with everyone</Label>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {dashboard ? 'Save' : 'Create dashboard'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
