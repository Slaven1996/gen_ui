import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { AppNotification, ListNotificationsQuery, NotificationList } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso, pageArgs, toPaginated } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import type { ForUser, NewNotification } from './new-notification.js';
import { notificationSelect, toDateColumn, toNotification } from './notification.mapper.js';
import { NotificationsGateway } from './notifications.gateway.js';

/** One stored notification and whose inbox it is in, ready to push. */
export interface Addressed {
  userId: string;
  notification: AppNotification;
}

/**
 * Every user's notification inbox. A producer stores first, inside its own
 * transaction (`createForActiveUsers` for everyone, `createFor` for given
 * people), and pushes after the commit (`push`), so a socket never announces
 * something a rollback undid. Reading, marking and deleting are always scoped
 * to the caller's own inbox.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Gives every active user their own copy of each notification, except
   * `except` (whoever caused it). Pass the caller's transaction as `db`.
   * Returns what to `push` once it commits.
   */
  async createForActiveUsers(items: NewNotification[], db: Db = this.prisma, except?: string): Promise<Addressed[]> {
    if (items.length === 0) return [];
    const users = await db.user.findMany({
      where: { isActive: true, ...(except && { id: { not: except } }) },
      select: { id: true },
    });
    return this.store(
      users.flatMap(({ id: userId }) => items.map((notification) => ({ userId, notification }))),
      db,
    );
  }

  /**
   * Puts each notification in its own person's inbox, skipping anyone
   * deactivated. Pass the caller's transaction as `db`. Returns what to
   * `push` once it commits.
   */
  async createFor(items: ForUser[], db: Db = this.prisma): Promise<Addressed[]> {
    if (items.length === 0) return [];
    const active = await db.user.findMany({
      where: { id: { in: [...new Set(items.map((item) => item.userId))] }, isActive: true },
      select: { id: true },
    });
    const activeIds = new Set(active.map((user) => user.id));
    return this.store(items.filter((item) => activeIds.has(item.userId)), db);
  }

  /**
   * Sends stored notifications to their users' open tabs. Best effort: they
   * are committed already, so a socket failure is only logged, and a user
   * with no tab open sees them on their next visit.
   */
  push(addressed: Addressed[]): void {
    try {
      for (const { userId, notification } of addressed) this.gateway.sendTo(userId, notification);
    } catch (error) {
      this.logger.warn(`Pushing notifications failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  private async store(items: ForUser[], db: Db): Promise<Addressed[]> {
    if (items.length === 0) return [];
    const createdAt = new Date();
    const addressed = items.map(({ userId, notification }) => ({
      userId,
      notification: { ...notification, id: randomUUID(), readAt: null, createdAt: iso(createdAt) },
    }));

    await db.notification.createMany({
      data: addressed.map(({ userId, notification }) => ({
        id: notification.id,
        userId,
        type: notification.type,
        severity: notification.severity,
        entrySeverity: notification.entrySeverity,
        title: notification.title,
        message: notification.message,
        assetId: notification.asset?.id ?? null,
        alarmId: notification.alarmId,
        shiftDate: toDateColumn(notification.shiftDate),
        demo: notification.demo,
        createdAt,
      })),
    });
    return addressed;
  }
}
