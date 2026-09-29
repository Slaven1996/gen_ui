import { z } from 'zod';
import { AlarmSeveritySchema } from './alarms.js';
import { AssetRefSchema } from './assets.js';

/*
 * Real-time notifications, pushed by the server over a WebSocket (Socket.IO)
 * the moment something happens; the browser never polls for them.
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
    title: z.string().describe('One line, e.g. "Wet well level high".'),
    message: z.string(),
    asset: AssetRefSchema.nullable().describe('Where it happened, for a link to the asset page.'),
    alarmId: z.guid().nullable().describe('The stored alarm, when there is one.'),
    demo: z.boolean().describe('Made up by the demo generator: nothing was stored.'),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AppNotification' });
export type AppNotification = z.infer<typeof AppNotificationSchema>;

/** Events the server emits on the notifications namespace (Socket.IO's typed event map). */
export interface NotificationServerEvents {
  notification: (notification: AppNotification) => void;
}
