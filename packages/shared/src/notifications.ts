import { z } from 'zod';
import { AlarmSeveritySchema } from './alarms.js';
import { AssetRefSchema } from './assets.js';
import { pageParams, paginatedSchema, queryBoolean } from './common/query.js';
import { LogSeveritySchema } from './logbook.js';

/*
 * Notifications: each user has their own inbox, stored server-side, so it
 * survives a reload and follows them to another browser. A new one is pushed
 * over a WebSocket (Socket.IO) the moment it is stored; the browser never
 * polls. It reads its inbox once, and again after every reconnect.
 *
 * Alarm kinds and warning or critical logbook entries go to every active user
 * but the one who caused them; a shift change goes to the person whose shift
 * it is.
 *
 * The socket is served under the API path, so the Vite dev proxy and nginx
 * forward it like any other `/api` request, on the web app's own origin.
 */

/** Socket.IO namespace for notifications. */
export const NOTIFICATIONS_NAMESPACE = '/notifications';

/** Socket.IO's HTTP path, under the API prefix. */
export const SOCKET_IO_PATH = '/api/socket.io';

export const NOTIFICATION_TYPES = [
  'ALARM_RAISED',
  'ALARM_ACKNOWLEDGED',
  'ALARM_CLEARED',
  'ALARM_NOTE',
  'LOGBOOK_ENTRY',
  'SHIFT_SCHEDULED',
  'SHIFT_CHANGED',
  'SHIFT_REMOVED',
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/**
 * One notification. Every kind has a title and a message; each also fills
 * the fields it links or grades by (`severity`, `entrySeverity`, `shiftDate`).
 */
export const AppNotificationSchema = z
  .object({
    id: z.uuid(),
    type: NotificationTypeSchema.describe(
      'ALARM_RAISED, ALARM_ACKNOWLEDGED, ALARM_CLEARED (by hand), ALARM_NOTE (a note on its timeline), LOGBOOK_ENTRY (a warning or critical one), SHIFT_SCHEDULED, SHIFT_CHANGED, SHIFT_REMOVED.',
    ),
    severity: AlarmSeveritySchema.nullable().describe('The alarm’s, for the ALARM_* kinds; null otherwise.'),
    entrySeverity: LogSeveritySchema.nullable().describe('The entry’s, for LOGBOOK_ENTRY; null otherwise.'),
    title: z.string().describe('One line, e.g. "Wet well high level".'),
    message: z.string(),
    asset: AssetRefSchema.nullable().describe('Where it happened, for a link to the asset page.'),
    alarmId: z
      .guid()
      .nullable()
      .describe('The alarm, for the ALARM_* kinds about one alarm (not a demo one or several acknowledged at once).'),
    shiftDate: z
      .iso.date()
      .nullable()
      .describe('The plant day of the (first) shift, for the SHIFT_* kinds, to open the calendar there; null otherwise.'),
    demo: z
      .boolean()
      .describe('Made up by the demo generator: no alarm behind it (`alarmId` is null). Stored like the rest.'),
    readAt: z.iso.datetime().nullable().describe('When you marked it read; null while unread.'),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AppNotification' });
export type AppNotification = z.infer<typeof AppNotificationSchema>;

/** Events the server emits on the notifications namespace (Socket.IO's typed event map). */
export interface NotificationServerEvents {
  notification: (notification: AppNotification) => void;
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

export const ListNotificationsQuerySchema = z.object({
  ...pageParams(20, 50),
  unread: queryBoolean().optional().describe('`true`: only unread ones. `false`: only read ones.'),
});
export type ListNotificationsQueryInput = z.input<typeof ListNotificationsQuerySchema>;
export type ListNotificationsQuery = z.output<typeof ListNotificationsQuerySchema>;

/** Newest first, plus the unread count for the bell's badge. */
export const NotificationListSchema = paginatedSchema(AppNotificationSchema)
  .extend({ unread: z.int().describe('All your unread notifications, whatever the filter and page.') })
  .meta({ id: 'NotificationList' });
export type NotificationList = z.infer<typeof NotificationListSchema>;

export const MarkNotificationsReadSchema = z
  .object({
    ids: z
      .array(z.guid())
      .min(1)
      .max(100)
      .optional()
      .describe('The notifications to mark read. Omit to mark all of yours read.'),
  })
  .meta({ id: 'MarkNotificationsRead' });
export type MarkNotificationsReadDto = z.output<typeof MarkNotificationsReadSchema>;
