import { useId, useState, type FormEvent } from 'react';
import {
  CreateLogbookEntrySchema,
  LOG_SEVERITIES,
  UpdateLogbookEntrySchema,
  USER_LOGBOOK_CATEGORIES,
  type EntryPrefill,
  type LogbookEntry,
  type LogSeverity,
} from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssetSelect } from '@/features/assets/components/asset-select';
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { formatDateTime, quoted } from '@/lib/format';
import { LOG_SEVERITY, LOGBOOK_CATEGORY } from '@/lib/labels';
import { useSaveLogbookEntry } from '../api/mutations';
import { fromEntry, withPrefill, type EntryFormState, type UserCategory } from '../lib/entry-form-state';

/**
 * The logbook entry form: the dialog's header, fields and button. The pages
 * show it in `EntryFormDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), with `prefill` over the entry's values (or the
 * defaults), each changed value hinting what it was. Either way it sits
 * inside a `Dialog`, which its title and description need.
 */
export function EntryForm({
  entry,
  initialAssetId,
  prefill,
  disabled = false,
  onSaved,
}: {
  entry?: LogbookEntry;
  initialAssetId?: string;
  prefill?: EntryPrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (entry: LogbookEntry) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => withPrefill(fromEntry(entry, initialAssetId), prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveLogbookEntry();

  const set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // When editing, a value the assistant changed says what it was.
  const before = entry && fromEntry(entry);
  const was = (key: keyof EntryFormState, show: (value: string) => string = (value) => value || 'empty') =>
    before && prefill?.[key] !== undefined && withPrefill(before, prefill)[key] !== before[key]
      ? `Was ${show(before[key] ?? '')}`
      : undefined;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      category: form.category,
      severity: form.severity,
      title: form.title,
      body: form.body.trim() || null,
      assetId: form.assetId ?? null,
      // An edit sends the time only if it changed: the field has no seconds, so sending it back would move the entry.
      occurredAt: form.occurredAt && form.occurredAt !== before?.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
    };
    const parsed = entry ? UpdateLogbookEntrySchema.safeParse(values) : CreateLogbookEntrySchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: entry?.id, input: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{entry ? 'Edit entry' : 'Write in the logbook'}</DialogTitle>
        <DialogDescription>Entries are visible to everyone on the team.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-category`} label="Type" hint={was('category', (value) => LOGBOOK_CATEGORY[value as UserCategory].label)}>
          <Select value={form.category} onValueChange={(value) => set('category', value as UserCategory)}>
            <SelectTrigger id={`${id}-category`} className="w-full">
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
        <Field id={`${id}-severity`} label="Severity" hint={was('severity', (value) => LOG_SEVERITY[value as LogSeverity].label)}>
          <Select value={form.severity} onValueChange={(value) => set('severity', value as LogSeverity)}>
            <SelectTrigger id={`${id}-severity`} className="w-full">
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
      <Field id={`${id}-title`} label="Title" hint={was('title', quoted)} error={errors.title}>
        <Input id={`${id}-title`} value={form.title} onChange={(event) => set('title', event.target.value)} />
      </Field>
      <Field id={`${id}-body`} label="Details" hint={was('body', quoted)} error={errors.body}>
        <Textarea id={`${id}-body`} rows={5} value={form.body} onChange={(event) => set('body', event.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-asset`} label="Asset" hint={was('assetId', () => entry?.asset?.name ?? 'no asset')}>
          <AssetSelect
            id={`${id}-asset`}
            value={form.assetId}
            onChange={(assetId) => set('assetId', assetId)}
            allLabel={null}
            noneLabel="No asset"
            className="w-full"
          />
        </Field>
        <Field id={`${id}-time`} label="When" hint={was('occurredAt', (value) => formatDateTime(value))} error={errors.occurredAt}>
          <Input id={`${id}-time`} type="datetime-local" value={form.occurredAt} onChange={(event) => set('occurredAt', event.target.value)} />
        </Field>
      </div>
      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : entry ? 'Save' : 'Add to logbook'}
        </Button>
      </DialogFooter>
    </form>
  );
}
