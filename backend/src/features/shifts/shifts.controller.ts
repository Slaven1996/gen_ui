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
  CopyShiftWeekSchema,
  CreateShiftAssignmentSchema,
  CreateShiftTemplateSchema,
  ListShiftAssignmentsQuerySchema,
  OnDutyQuerySchema,
  OnDutySchema,
  PaginatedShiftAssignmentsSchema,
  ShiftCalendarQuerySchema,
  ShiftCalendarSchema,
  ShiftChangeResultSchema,
  ShiftRemoveResultSchema,
  ShiftScopeQuerySchema,
  ShiftTemplateSchema,
  ShiftTemplatesSchema,
  UpdateShiftAssignmentSchema,
  UpdateShiftTemplateSchema,
  type CopyShiftWeekDto,
  type CreateShiftAssignmentDto,
  type CreateShiftTemplateDto,
  type ListShiftAssignmentsQuery,
  type OnDuty,
  type OnDutyQuery,
  type Paginated,
  type ShiftAssignment,
  type ShiftCalendar,
  type ShiftCalendarQuery,
  type ShiftChangeResult,
  type ShiftRemoveResult,
  type ShiftScopeQuery,
  type ShiftTemplate,
  type UpdateShiftAssignmentDto,
  type UpdateShiftTemplateDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { ShiftsService } from './shifts.service.js';

@ApiTags('Shifts')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  // ─── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List shift templates', description: 'Active ones first, then by start time.' })
  @ApiOkResponse({ standardSchema: ShiftTemplatesSchema })
  async listTemplates(): Promise<{ items: ShiftTemplate[] }> {
    return { items: await this.shifts.listTemplates() };
  }

  @Post('templates')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Create a shift template',
    description: 'A reusable pattern: name, start time in the plant time zone, wall-clock length, colour and staffing target (`coverage`).',
  })
  @ApiCreatedResponse({ standardSchema: ShiftTemplateSchema })
  @ApiErrorResponse(400, 'A field is invalid.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'That name is already taken.')
  createTemplate(
    @Body({ schema: CreateShiftTemplateSchema }) dto: CreateShiftTemplateDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftTemplate> {
    return this.shifts.createTemplate(dto, actor);
  }

  @Patch('templates/:id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Update a shift template',
    description: 'Existing assignments keep the times they were created with. A new `coverage` replaces the old one.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ShiftTemplateSchema })
  @ApiErrorResponse(400, 'No fields sent, or a field is invalid.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No template with that id.')
  @ApiErrorResponse(409, 'That name is already taken.')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateShiftTemplateSchema }) dto: UpdateShiftTemplateDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftTemplate> {
    return this.shifts.updateTemplate(id, dto, actor);
  }

  @Delete('templates/:id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a shift template', description: 'Only one that was never scheduled; deactivate the others.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No template with that id.')
  @ApiErrorResponse(409, 'The template has been scheduled.')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.shifts.removeTemplate(id, actor);
  }

  // ─── Calendar ─────────────────────────────────────────────────────────────

  @Get('calendar')
  @ApiOperation({
    summary: 'Shift calendar',
    description:
      'One month (Monday-aligned weeks), week (Monday–Sunday) or day of the plan, in the plant time zone: its days, the shifts overlapping it (including the night that started the evening before), the shift templates in use and every staffing target with how far it is met. Targets ignore `userId`, so a filtered view still shows gaps. The same query as the Shifts page’s URL.',
  })
  @ApiOkResponse({ standardSchema: ShiftCalendarSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  calendar(@Query({ schema: ShiftCalendarQuerySchema }) query: ShiftCalendarQuery): Promise<ShiftCalendar> {
    return this.shifts.calendar(query);
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  @Get('assignments')
  @ApiOperation({
    summary: 'List shift assignments',
    description:
      'Assignments that overlap `from`–`to` (a shift that started before `from` but is still running is included), up to 500 per page. For a calendar, `GET /shifts/calendar` is simpler.',
  })
  @ApiOkResponse({ standardSchema: PaginatedShiftAssignmentsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid, or `from` is not before `to`.')
  listAssignments(
    @Query({ schema: ListShiftAssignmentsQuerySchema }) query: ListShiftAssignmentsQuery,
  ): Promise<Paginated<ShiftAssignment>> {
    return this.shifts.listAssignments(query);
  }

  @Post('assignments')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Schedule someone',
    description:
      'Puts one person on a shift template for `date`, or with `repeat` on the chosen weekdays through `repeat.until` (one series). Dates and the template’s start time are in the plant time zone; `startTime`/`durationMinutes` set custom hours. All or nothing: any overlap with that person’s existing shifts rejects the whole request.',
  })
  @ApiCreatedResponse({ standardSchema: ShiftChangeResultSchema })
  @ApiErrorResponse(400, 'A field is invalid, the template is inactive, the user is deactivated, or the series is too long.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'An occurrence overlaps one of their existing shifts.')
  createAssignments(
    @Body({ schema: CreateShiftAssignmentSchema }) dto: CreateShiftAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftChangeResult> {
    return this.shifts.createAssignments(dto, actor);
  }

  @Post('assignments/copy-week')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Copy a week',
    description:
      'Repeats the shifts that start in `week` (Monday–Sunday, plant time zone; optionally only some people or shifts) in each of the next `weeks` weeks, at the same local times. Shifts of deactivated people or inactive templates are skipped. All or nothing: if any copy overlaps a shift already planned for that person, nothing is created.',
  })
  @ApiCreatedResponse({ standardSchema: ShiftChangeResultSchema })
  @ApiErrorResponse(400, 'A field is invalid, the week has nothing to copy, or it would create too many shifts.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'Some copies overlap shifts already planned; the message lists them.')
  copyWeek(
    @Body({ schema: CopyShiftWeekSchema }) dto: CopyShiftWeekDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftChangeResult> {
    return this.shifts.copyWeek(dto, actor);
  }

  @Patch('assignments/:id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Update a shift assignment',
    description:
      'Change the person, role or notes of this shift, or with `scope` of the rest (`following`) or all (`series`) of its series that have not started yet. Only `scope=one` may move it in time (`templateId`, `date`, `startTime`, `durationMinutes`); that, or a new person, takes it out of its series.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ShiftChangeResultSchema })
  @ApiErrorResponse(400, 'No fields sent, a field is invalid, a time change with a wider scope, an inactive template, or a deactivated user.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No assignment with that id.')
  @ApiErrorResponse(409, 'The person is already on a shift at that time.')
  updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: ShiftScopeQuerySchema }) query: ShiftScopeQuery,
    @Body({ schema: UpdateShiftAssignmentSchema }) dto: UpdateShiftAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftChangeResult> {
    return this.shifts.updateAssignment(id, dto, query.scope, actor);
  }

  @Delete('assignments/:id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Remove a shift assignment',
    description: 'This shift, or with `scope` the rest (`following`) or all (`series`) of its series that have not started yet.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ShiftRemoveResultSchema })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No assignment with that id.')
  removeAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: ShiftScopeQuerySchema }) query: ShiftScopeQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftRemoveResult> {
    return this.shifts.removeAssignment(id, query.scope, actor);
  }

  @Get('on-duty')
  @ApiOperation({
    summary: 'Who is on shift',
    description: 'Active people whose shift covers `at` (default: now), by role, and the next shifts to start within 24 hours.',
  })
  @ApiOkResponse({ standardSchema: OnDutySchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  onDuty(@Query({ schema: OnDutyQuerySchema }) query: OnDutyQuery): Promise<OnDuty> {
    return this.shifts.onDuty(query);
  }
}
