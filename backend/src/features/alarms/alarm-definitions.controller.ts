import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AlarmDefinitionSchema,
  CreateAlarmDefinitionSchema,
  ListAlarmDefinitionsQuerySchema,
  PaginatedAlarmDefinitionsSchema,
  UpdateAlarmDefinitionSchema,
  type AlarmDefinition,
  type CreateAlarmDefinitionDto,
  type ListAlarmDefinitionsQuery,
  type Paginated,
  type UpdateAlarmDefinitionDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AlarmDefinitionsService } from './alarm-definitions.service.js';

@ApiTags('Alarm rules')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('alarm-definitions')
export class AlarmDefinitionsController {
  constructor(private readonly definitions: AlarmDefinitionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List alarm rules',
    description:
      'Each rule compares every new reading of one tag with a threshold. `search` matches the rule name and the name or code of its tag. `assetId` includes rules on tags anywhere below that asset (a site finds the rules of its equipment). `openAlarmCount` is how many of its alarms still need attention.',
  })
  @ApiOkResponse({ standardSchema: PaginatedAlarmDefinitionsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(
    @Query({ schema: ListAlarmDefinitionsQuerySchema }) query: ListAlarmDefinitionsQuery,
  ): Promise<Paginated<AlarmDefinition>> {
    return this.definitions.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one alarm rule' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AlarmDefinitionSchema })
  @ApiErrorResponse(404, 'No rule with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AlarmDefinition> {
    return this.definitions.get(id);
  }

  @Post()
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Create an alarm rule',
    description: 'Takes effect from the next reading of the tag. `deadband` is the hysteresis a value must cross back before the alarm clears.',
  })
  @ApiCreatedResponse({ standardSchema: AlarmDefinitionSchema })
  @ApiErrorResponse(400, 'A field is invalid, or the tag does not exist.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  create(
    @Body({ schema: CreateAlarmDefinitionSchema }) dto: CreateAlarmDefinitionDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AlarmDefinition> {
    return this.definitions.create(dto, actor);
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Update an alarm rule',
    description: 'Send only the fields to change. Alarms already raised keep the severity and message they were raised with.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AlarmDefinitionSchema })
  @ApiErrorResponse(400, 'No fields sent, or a field is invalid.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No rule with that id.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateAlarmDefinitionSchema }) dto: UpdateAlarmDefinitionDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AlarmDefinition> {
    return this.definitions.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an alarm rule', description: 'Only a rule that has never fired; disable the others.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No rule with that id.')
  @ApiErrorResponse(409, 'The rule has alarm history.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.definitions.remove(id, actor);
  }
}
