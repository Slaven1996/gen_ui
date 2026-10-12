import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Every alarm becomes a row per active user, so `notifications` grows
 * quickly. Ones older than NOTIFICATION_RETENTION_DAYS, read or not, are
 * deleted; the alarms themselves and their logbook entries stay.
 *
 * Deletion is idempotent, so running this on every instance is harmless.
 */
@Injectable()
export class NotificationsCleanupService {
  private readonly logger = new Logger(NotificationsCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'prune-notifications' })
  async prune(): Promise<number> {
    const retentionDays = this.config.get('NOTIFICATION_RETENTION_DAYS');
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

    try {
      // Index-driven: `notifications_created_at_idx`.
      const { count } = await this.prisma.notification.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Pruned ${count} notification(s) older than ${cutoff.toISOString()}`);
      }
      return count;
    } catch (error) {
      // A failed prune is not worth crashing the process over; try again tomorrow.
      this.logger.error(
        'Notification prune failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
