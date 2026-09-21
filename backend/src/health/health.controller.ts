import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorResponse } from '../docs/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface HealthStatus {
  status: 'ok';
}

const HealthStatusSchema = z.object({ status: z.literal('ok') }).meta({ id: 'HealthStatus' });

const DB_UNREACHABLE = 'The database did not answer. This instance should not receive traffic.';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Kept for existing callers; behaves like `/health/ready`. */
  @Get()
  @ApiOperation({ summary: 'Readiness (legacy path)', description: 'Kept for existing callers; identical to `/ready`.' })
  @ApiOkResponse({ standardSchema: HealthStatusSchema })
  @ApiErrorResponse(503, DB_UNREACHABLE)
  check(): Promise<HealthStatus> {
    return this.ready();
  }

  /**
   * Liveness: is the process still running and able to answer? Deliberately
   * dependency-free — a database blip must not get a healthy container
   * restarted, which is what a readiness failure is for.
   */
  @Get('live')
  @ApiOperation({
    summary: 'Liveness',
    description:
      'Answers as long as the process can serve. Deliberately has no dependencies, so a database blip never gets a healthy container restarted. This is what the Docker healthcheck calls.',
  })
  @ApiOkResponse({ standardSchema: HealthStatusSchema })
  live(): HealthStatus {
    return { status: 'ok' };
  }

  /** Readiness: should this instance receive traffic? 503 while the database is unreachable. */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness',
    description: 'Pings the database. Use it for load-balancer membership, not for restarts.',
  })
  @ApiOkResponse({ standardSchema: HealthStatusSchema })
  @ApiErrorResponse(503, DB_UNREACHABLE)
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
