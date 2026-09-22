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
  CreateLogbookEntrySchema,
  ListLogbookQuerySchema,
  LogbookEntrySchema,
  PaginatedLogbookSchema,
  UpdateLogbookEntrySchema,
  type CreateLogbookEntryDto,
  type ListLogbookQuery,
  type LogbookEntry,
  type Paginated,
  type UpdateLogbookEntryDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { LogbookService } from './logbook.service.js';

@ApiTags('Logbook')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('logbook')
export class LogbookController {
  constructor(private readonly logbook: LogbookService) {}

  @Get()
  @ApiOperation({
    summary: 'List logbook entries',
    description:
      'One timeline of what people wrote (notes, maintenance, shift handovers) and what the system recorded (alarms raised, cleared and acknowledged; device status changes). `source` separates the two.',
  })
  @ApiOkResponse({ standardSchema: PaginatedLogbookSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid, or `from` is not before `to`.')
  list(@Query({ schema: ListLogbookQuerySchema }) query: ListLogbookQuery): Promise<Paginated<LogbookEntry>> {
    return this.logbook.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one logbook entry' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: LogbookEntrySchema })
  @ApiErrorResponse(404, 'No entry with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LogbookEntry> {
    return this.logbook.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Write a logbook entry',
    description: 'Any signed-in user. With `alarmId`, the entry appears on that alarm’s timeline and takes its asset.',
  })
  @ApiCreatedResponse({ standardSchema: LogbookEntrySchema })
  @ApiErrorResponse(400, 'A field is invalid, or the asset or alarm does not exist.')
  create(
    @Body({ schema: CreateLogbookEntrySchema }) dto: CreateLogbookEntryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<LogbookEntry> {
    return this.logbook.create(dto, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a logbook entry', description: 'Only the author, and never a system event.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: LogbookEntrySchema })
  @ApiErrorResponse(400, 'No fields sent, or a field is invalid.')
  @ApiErrorResponse(403, 'You are not the author.')
  @ApiErrorResponse(404, 'No entry with that id.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateLogbookEntrySchema }) dto: UpdateLogbookEntryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<LogbookEntry> {
    return this.logbook.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a logbook entry', description: 'The author or an admin. System events are permanent.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, 'Not yours to delete, or a system event.')
  @ApiErrorResponse(404, 'No entry with that id.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.logbook.remove(id, actor);
  }
}
