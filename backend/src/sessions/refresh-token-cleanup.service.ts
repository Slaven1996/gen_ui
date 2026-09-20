import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Refresh tokens are not deleted at logout or rotation — the row is what makes
 * reuse detection work. Once a token is long past its expiry it can no longer
 * tell us anything, so it is pruned to stop `refresh_tokens` (and its indexes)
 * growing without bound.
 *
 * Deletion is idempotent, so running this on every instance is harmless.
 */
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'prune-refresh-tokens' })
  async prune(): Promise<number> {
    const retentionDays = this.config.get('REFRESH_TOKEN_PRUNE_AFTER_DAYS');
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

    try {
      // Index-driven: `refresh_tokens_expires_at_idx`.
      const { count } = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Pruned ${count} refresh token(s) that expired before ${cutoff.toISOString()}`);
      }
      return count;
    } catch (error) {
      // A failed prune is not worth crashing the process over; try again tomorrow.
      this.logger.error(
        'Refresh token prune failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
