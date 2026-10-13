import type { AppNotification } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso, isoOrNull } from '../../common/list-query.js';
import { assetRefSelect } from '../assets/asset.mapper.js';

export const notificationSelect = {
  id: true,
  type: true,
  severity: true,
  entrySeverity: true,
  title: true,
  message: true,
  alarmId: true,
  shiftDate: true,
  demo: true,
  readAt: true,
  createdAt: true,
  asset: { select: assetRefSelect },
} as const satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

/** A `DATE` column comes back as midnight UTC: its day is the first ten characters. */
export const fromDateColumn = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;

/** `YYYY-MM-DD` → the value Prisma writes into a `DATE` column. */
export const toDateColumn = (date: string | null): Date | null => (date ? new Date(`${date}T00:00:00Z`) : null);

export function toNotification(row: NotificationRecord): AppNotification {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    entrySeverity: row.entrySeverity,
    title: row.title,
    message: row.message,
    asset: row.asset,
    alarmId: row.alarmId,
    shiftDate: fromDateColumn(row.shiftDate),
    demo: row.demo,
    readAt: isoOrNull(row.readAt),
    createdAt: iso(row.createdAt),
  };
}
