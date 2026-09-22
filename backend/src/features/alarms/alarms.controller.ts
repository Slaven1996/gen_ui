import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  AcknowledgeAlarmSchema,
  AcknowledgeAlarmsSchema,
  AcknowledgeResultSchema,
  AlarmSchema,
  ListAlarmsQuerySchema,
  PaginatedAlarmsSchema,
  type AcknowledgeAlarmDto,
  type AcknowledgeAlarmsDto,
  type AcknowledgeResult,
  type Alarm,
  type ListAlarmsQuery,
  type Paginated,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AlarmsService } from './alarms.service.js';

@ApiTags('Alarms')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarms: AlarmsService) {}

  @Get()
  @ApiOperation({
    summary: 'List alarms',
    description:
      'The alarm console. States: `ACTIVE` (present, unacknowledged), `ACKNOWLEDGED` (present, acknowledged), `CLEARED` (gone, unacknowledged), `CLOSED` (gone and acknowledged). Open alarms are `state=ACTIVE,ACKNOWLEDGED,CLEARED`. The time range filters on `raisedAt`; `assetId` includes everything below that asset. Each alarm’s timeline is `GET /api/logbook?alarmId=…`.',
  })
  @ApiOkResponse({ standardSchema: PaginatedAlarmsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid, or `from` is not before `to`.')
  list(@Query({ schema: ListAlarmsQuerySchema }) query: ListAlarmsQuery): Promise<Paginated<Alarm>> {
    return this.alarms.list(query);
  }

  @Post('acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge several alarms',
    description: 'Up to 100 at once. Alarms that are already acknowledged, or do not exist, are counted as `skipped`.',
  })
  @ApiOkResponse({ standardSchema: AcknowledgeResultSchema })
  @ApiErrorResponse(400, 'No ids, more than 100, or an id is not a UUID.')
  acknowledgeMany(
    @Body({ schema: AcknowledgeAlarmsSchema }) dto: AcknowledgeAlarmsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcknowledgeResult> {
    return this.alarms.acknowledgeMany(dto.ids, dto.note, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one alarm' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AlarmSchema })
  @ApiErrorResponse(404, 'No alarm with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Alarm> {
    return this.alarms.get(id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge an alarm',
    description: '`ACTIVE` becomes `ACKNOWLEDGED`, `CLEARED` becomes `CLOSED`. The optional note is kept on the alarm and in the logbook.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AlarmSchema })
  @ApiErrorResponse(404, 'No alarm with that id.')
  @ApiErrorResponse(409, 'Already acknowledged.')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: AcknowledgeAlarmSchema }) dto: AcknowledgeAlarmDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<Alarm> {
    return this.alarms.acknowledge(id, dto.note, actor);
  }

  @Post(':id/clear')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear an alarm by hand',
    description:
      'For when the condition cannot clear itself — a failed sensor, a device that stopped reporting. `ACTIVE` becomes `CLEARED`, `ACKNOWLEDGED` becomes `CLOSED`. If the value is still out of range, the next reading raises a new alarm.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AlarmSchema })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No alarm with that id.')
  @ApiErrorResponse(409, 'Already cleared.')
  clear(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<Alarm> {
    return this.alarms.clear(id, actor);
  }
}
