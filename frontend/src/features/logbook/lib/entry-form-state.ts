import { USER_LOGBOOK_CATEGORIES, type EntryPrefill, type LogbookEntry, type LogSeverity } from '@gen-ui/shared';

export type UserCategory = (typeof USER_LOGBOOK_CATEGORIES)[number];

const localNow = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toLocal = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export interface EntryFormState {
  category: UserCategory;
  severity: LogSeverity;
  title: string;
  body: string;
  assetId: string | undefined;
  occurredAt: string;
}

export const fromEntry = (entry?: LogbookEntry, assetId?: string): EntryFormState => ({
  category: entry && entry.category !== 'ALARM' && entry.category !== 'DEVICE' ? entry.category : 'NOTE',
  severity: entry?.severity ?? 'INFO',
  title: entry?.title ?? '',
  body: entry?.body ?? '',
  assetId: entry?.asset?.id ?? assetId,
  occurredAt: entry ? toLocal(entry.occurredAt) : localNow(),
});

/** `form`, with the values the assistant filled in put over it. */
export const withPrefill = (form: EntryFormState, prefill: EntryPrefill = {}): EntryFormState => ({
  ...form,
  category: prefill.category ?? form.category,
  severity: prefill.severity ?? form.severity,
  title: prefill.title ?? form.title,
  body: prefill.body ?? form.body,
  // null: no asset.
  assetId: prefill.assetId === undefined ? form.assetId : (prefill.assetId ?? undefined),
  occurredAt: prefill.occurredAt === undefined ? form.occurredAt : toLocal(prefill.occurredAt),
});

