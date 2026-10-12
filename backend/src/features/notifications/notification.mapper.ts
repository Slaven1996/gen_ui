import type { AppNotification } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso, isoOrNull } from '../../common/list-query.js';
import { assetRefSelect } from '../assets/asset.mapper.js';

export const notificationSelect = {
  id: true,
  type: true,
  severity: true,
  title: true,
  message: true,
  alarmId: true,
  demo: true,
  readAt: true,
  createdAt: true,
  asset: { select: assetRefSelect },
} as const satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export function toNotification(row: NotificationRecord): AppNotification {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    asset: row.asset,
    alarmId: row.alarmId,
    demo: row.demo,
    readAt: isoOrNull(row.readAt),
    createdAt: iso(row.createdAt),
  };
}
