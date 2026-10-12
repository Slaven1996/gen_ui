import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AppNotification, ListNotificationsQuery, NotificationList } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso, pageArgs, toPaginated } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { notificationSelect, toNotification } from './notification.mapper.js';
import { NotificationsGateway } from './notifications.gateway.js';

/** What a producer sends: the notification before it has an id, a time and a reader. */
export type NewNotification = Omit<AppNotification, 'id' | 'readAt' | 'createdAt'>;

/** One stored notification and whose inbox it is in, ready to push. */
export interface Addressed {
  userId: string;
  notification: AppNotification;
}

/**
 * Every user's notification inbox. A producer stores first, inside its own
 * transaction (`createForActiveUsers`), and pushes after the commit (`push`),
 * so a socket never announces something a rollback undid. Reading, marking
 * and deleting are always scoped to the caller's own inbox.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Gives every active user their own copy of each notification. Pass the
   * caller's transaction as `db`. Returns what to `push` once it commits.
   */
  async createForActiveUsers(items: NewNotification[], db: Db = this.prisma): Promise<Addressed[]> {
    if (items.length === 0) return [];
    const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
    const createdAt = new Date();
    const addressed = users.flatMap(({ id: userId }) =>
      items.map((item) => ({
        userId,
        notification: { ...item, id: randomUUID(), readAt: null, createdAt: iso(createdAt) },
      })),
    );
    if (addressed.length === 0) return [];

    await db.notification.createMany({
      data: addressed.map(({ userId, notification }) => ({
        id: notification.id,
        userId,
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        assetId: notification.asset?.id ?? null,
        alarmId: notification.alarmId,
        demo: notification.demo,
        createdAt,
      })),
    });
    return addressed;
  }

  /** Sends stored notifications to their users' open tabs. A user with none open sees them on their next visit. */
  push(addressed: Addressed[]): void {
    for (const { userId, notification } of addressed) this.gateway.sendTo(userId, notification);
  }

  async list(userId: string, query: ListNotificationsQuery): Promise<NotificationList> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread !== undefined && { readAt: query.unread ? null : { not: null } }),
    };
    const [rows, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { ...toPaginated(rows.map(toNotification), total, query), unread };
  }

  /** Marks `ids` read, or every unread one without `ids`. Ids that aren't the user's are ignored. */
  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
  }

  /** Dismisses one. An unknown id is not an error: there is simply nothing to delete. */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  /** Empties the user's inbox. */
  async clear(userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId } });
  }
}
