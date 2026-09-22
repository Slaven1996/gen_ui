import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreateShiftTemplateSchema, type ShiftTemplate } from '@gen-ui/shared';
import { Field, fieldErrors } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api/errors';
import { shiftTemplatesQueryOptions, useDeleteTemplate, useSaveTemplate } from './api';

const empty = { name: '', startTime: '06:00', hours: '8', color: '#3b82f6' };

/** The reusable shift patterns. Scheduled templates can be deactivated but not deleted. */
export function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const templates = useQuery({ ...shiftTemplatesQueryOptions(), enabled: open });
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateShiftTemplateSchema.safeParse({
      name: form.name,
      startTime: form.startTime,
      durationMinutes: Math.round(Number(form.hours) * 60),
      color: form.color,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ input: parsed.data }, { onSuccess: () => setForm(empty) });
  };

  const toggle = (template: ShiftTemplate, isActive: boolean) => save.mutate({ id: template.id, input: { isActive } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shift templates</DialogTitle>
          <DialogDescription>Changing a template affects new shifts only; scheduled ones keep their times.</DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {templates.data?.map((template) => (
            <li key={template.id} className="flex items-center gap-3 px-3 py-2">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: template.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{template.name}</div>
                <div className="text-xs text-muted-foreground">
                  {template.startTime}, {template.durationMinutes / 60} h
                </div>
              </div>
              <Switch
                checked={template.isActive}
                onCheckedChange={(checked) => toggle(template, checked)}
                aria-label={`${template.isActive ? 'Deactivate' : 'Activate'} ${template.name}`}
              />
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove.mutate(template)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>

        <Separator />

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <p className="text-sm font-medium">New template</p>
          <div className="grid grid-cols-[1fr_6rem_5rem_3rem] gap-2">
            <Field id="template-name" label="Name" error={errors.name}>
              <Input id="template-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field id="template-start" label="Starts" error={errors.startTime}>
              <Input id="template-start" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
            </Field>
            <Field id="template-hours" label="Hours" error={errors.durationMinutes && '0.25–24'}>
              <Input id="template-hours" type="number" min={0.25} max={24} step={0.25} value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
            </Field>
            <Field id="template-color" label="Colour">
              <Input id="template-color" type="color" className="p-1" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
            </Field>
          </div>
          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <Button type="submit" size="sm" disabled={save.isPending}>
            Add template
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
