import { useEffect, useState, type FormEvent } from 'react';
import {
  CreateLogbookEntrySchema,
  LOG_SEVERITIES,
  UpdateLogbookEntrySchema,
  USER_LOGBOOK_CATEGORIES,
  type LogbookEntry,
  type LogSeverity,
} from '@gen-ui/shared';
import { Field, fieldErrors } from '@/components/form/field';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssetSelect } from '@/features/assets/asset-select';
import { getErrorMessage } from '@/lib/api/errors';
import { LOG_SEVERITY, LOGBOOK_CATEGORY } from '@/lib/labels';
import { useSaveLogbookEntry } from './api';

type UserCategory = (typeof USER_LOGBOOK_CATEGORIES)[number];

const localNow = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toLocal = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

interface FormState {
  category: UserCategory;
  severity: LogSeverity;
  title: string;
  body: string;
  assetId: string | undefined;
  occurredAt: string;
}

const fromEntry = (entry?: LogbookEntry, assetId?: string): FormState => ({
  category: entry && entry.category !== 'ALARM' && entry.category !== 'DEVICE' ? entry.category : 'NOTE',
  severity: entry?.severity ?? 'INFO',
  title: entry?.title ?? '',
  body: entry?.body ?? '',
  assetId: entry?.asset?.id ?? assetId,
  occurredAt: entry ? toLocal(entry.occurredAt) : localNow(),
});

/** Write a note, a maintenance record or a shift handover — or edit your own. */
export function EntryFormDialog({
  open,
  onOpenChange,
  entry,
  initialAssetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: LogbookEntry;
  initialAssetId?: string;
}) {
  const [form, setForm] = useState(() => fromEntry(entry, initialAssetId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveLogbookEntry();

  useEffect(() => {
    if (open) {
      setForm(fromEntry(entry, initialAssetId));
      setErrors({});
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, entry?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      category: form.category,
      severity: form.severity,
      title: form.title,
      body: form.body.trim() || null,
      assetId: form.assetId ?? null,
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
    };
    const parsed = entry ? UpdateLogbookEntrySchema.safeParse(values) : CreateLogbookEntrySchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: entry?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{entry ? 'Edit entry' : 'Write in the logbook'}</DialogTitle>
            <DialogDescription>Entries are visible to everyone on the team.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field id="entry-category" label="Type">
              <Select value={form.category} onValueChange={(value) => set('category', value as UserCategory)}>
                <SelectTrigger id="entry-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_LOGBOOK_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {LOGBOOK_CATEGORY[category].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="entry-severity" label="Severity">
              <Select value={form.severity} onValueChange={(value) => set('severity', value as LogSeverity)}>
                <SelectTrigger id="entry-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {LOG_SEVERITY[severity].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field id="entry-title" label="Title" error={errors.title}>
            <Input id="entry-title" value={form.title} onChange={(event) => set('title', event.target.value)} />
          </Field>
          <Field id="entry-body" label="Details" error={errors.body}>
            <Textarea id="entry-body" rows={5} value={form.body} onChange={(event) => set('body', event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="entry-asset" label="Asset">
              <AssetSelect
                id="entry-asset"
                value={form.assetId}
                onChange={(assetId) => set('assetId', assetId)}
                allLabel={null}
                noneLabel="No asset"
                className="w-full"
              />
            </Field>
            <Field id="entry-time" label="When" error={errors.occurredAt}>
              <Input id="entry-time" type="datetime-local" value={form.occurredAt} onChange={(event) => set('occurredAt', event.target.value)} />
            </Field>
          </div>
          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : entry ? 'Save' : 'Add to logbook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
