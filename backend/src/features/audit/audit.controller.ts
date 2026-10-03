import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListAuditLogsQuerySchema,
  PaginatedAuditLogsSchema,
  type AuditLog,
  type ListAuditLogsQuery,
  type Paginated,
} from '@gen-ui/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit log')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@ApiErrorResponse(403, ADMIN_ONLY)
@Controller('audit-logs')
@Roles(['ADMIN'])
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'List audit records',
    description:
      'Who changed what, newest first by default. Every create, update, delete and acknowledgement in the app writes one record in the same transaction as the change. `action` takes an exact action (`alarm.acknowledge`) or a prefix ending in a dot (`alarm.`). `actorId` picks people by id.',
  })
  @ApiOkResponse({ standardSchema: PaginatedAuditLogsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid, or `from` is not before `to`.')
  list(@Query({ schema: ListAuditLogsQuerySchema }) query: ListAuditLogsQuery): Promise<Paginated<AuditLog>> {
    return this.audit.list(query);
  }
}
