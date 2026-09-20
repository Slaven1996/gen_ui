import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface HealthStatus {
  status: 'ok';
}

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Kept for existing callers; behaves like `/health/ready`. */
  @Get()
  check(): Promise<HealthStatus> {
    return this.ready();
  }

  /**
   * Liveness: is the process still running and able to answer? Deliberately
   * dependency-free — a database blip must not get a healthy container
   * restarted, which is what a readiness failure is for.
   */
  @Get('live')
  live(): HealthStatus {
    return { status: 'ok' };
  }

  /** Readiness: should this instance receive traffic? 503 while the database is unreachable. */
  @Get('ready')
  async ready(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(
        `Readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok' };
  }
}
