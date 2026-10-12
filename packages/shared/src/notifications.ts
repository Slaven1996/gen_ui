import { z } from 'zod';
import { AlarmSeveritySchema } from './alarms.js';
import { AssetRefSchema } from './assets.js';
import { pageParams, paginatedSchema, queryBoolean } from './common/query.js';

/*
 * Notifications: each user has their own inbox, stored server-side, so it
 * survives a reload and follows them to another browser. A new one is pushed
 * over a WebSocket (Socket.IO) the moment it is stored; the browser never
 * polls. It reads its inbox once, and again after every reconnect.
 *
 * The socket is served under the API path, so the Vite dev proxy and nginx
 * forward it like any other `/api` request, on the web app's own origin.
 */

/** Socket.IO namespace for notifications. */
export const NOTIFICATIONS_NAMESPACE = '/notifications';

/** Socket.IO's HTTP path, under the API prefix. */
export const SOCKET_IO_PATH = '/api/socket.io';

/**
 * One notification. Only alarms so far; a new `type` adds its own fields and
 * its own rendering in the bell's list.
 */
export const AppNotificationSchema = z
  .object({
    id: z.uuid(),
    type: z.literal('ALARM'),
    severity: AlarmSeveritySchema,
    title: z.string().describe('One line, e.g. "Wet well high level".'),
    message: z.string(),
    asset: AssetRefSchema.nullable().describe('Where it happened, for a link to the asset page.'),
    alarmId: z.guid().nullable().describe('The stored alarm, when there is one.'),
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
