import type { AppNotification } from '@gen-ui/shared';

/** What a producer sends: the notification before it has an id, a time and a reader. */
export type NewNotification = Omit<AppNotification, 'id' | 'readAt' | 'createdAt'>;

/** A notification for one person's inbox, not stored yet. */
export interface ForUser {
  userId: string;
  notification: NewNotification;
}

type KindFields = 'severity' | 'entrySeverity' | 'asset' | 'alarmId' | 'shiftDate' | 'demo';

/** A notification with only the fields its kind uses; the rest are empty. */
export const draft = (
  fields: Omit<NewNotification, KindFields> & Partial<Pick<NewNotification, KindFields>>,
): NewNotification => ({
  severity: null,
  entrySeverity: null,
  asset: null,
  alarmId: null,
  shiftDate: null,
  demo: false,
  ...fields,
});

/** Notification text quotes what people wrote, cut to a line or two. */
export const clipText = (text: string, max = 200): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
