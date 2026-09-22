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
  CreatedShiftAssignmentsSchema,
  CreateShiftAssignmentSchema,
  CreateShiftTemplateSchema,
  ListShiftAssignmentsQuerySchema,
  OnDutyQuerySchema,
  OnDutySchema,
  PaginatedShiftAssignmentsSchema,
  ShiftAssignmentSchema,
  ShiftTemplateSchema,
  ShiftTemplatesSchema,
  UpdateShiftAssignmentSchema,
  UpdateShiftTemplateSchema,
  type CreateShiftAssignmentDto,
  type CreateShiftTemplateDto,
  type ListShiftAssignmentsQuery,
  type OnDuty,
  type OnDutyQuery,
  type Paginated,
  type ShiftAssignment,
  type ShiftTemplate,
  type UpdateShiftAssignmentDto,
  type UpdateShiftTemplateDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
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
  @ApiOperation({ summary: 'Create a shift template', description: 'A reusable pattern: name, local start time, length.' })
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
  @ApiOperation({ summary: 'Update a shift template', description: 'Existing assignments keep the times they were created with.' })
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

  // ─── Assignments ──────────────────────────────────────────────────────────

  @Get('assignments')
  @ApiOperation({
    summary: 'List shift assignments',
    description: 'Assignments that overlap `from`–`to` (a shift that started before `from` but is still running is included). Up to 500 per page, for calendar views.',
  })
  @ApiOkResponse({ standardSchema: PaginatedShiftAssignmentsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
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
      'Puts one person on a shift template for `date`, or with `repeat` on the chosen weekdays through `repeat.until`. The template’s start time is read in `timeZone`. All or nothing: any overlap with that person’s existing shifts rejects the whole request.',
  })
  @ApiCreatedResponse({ standardSchema: CreatedShiftAssignmentsSchema })
  @ApiErrorResponse(400, 'A field is invalid, the template is inactive, the user is deactivated, or the series is too long.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'An occurrence overlaps one of their existing shifts.')
  async createAssignments(
    @Body({ schema: CreateShiftAssignmentSchema }) dto: CreateShiftAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ items: ShiftAssignment[] }> {
    return { items: await this.shifts.createAssignments(dto, actor) };
  }

  @Patch('assignments/:id')
  @Roles(['ADMIN'])
  @ApiOperation({ summary: 'Update a shift assignment', description: 'Swap the person, change the role or the notes. To change times, remove and schedule again.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ShiftAssignmentSchema })
  @ApiErrorResponse(400, 'No fields sent, a field is invalid, or the user is deactivated.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No assignment with that id.')
  @ApiErrorResponse(409, 'The new person is already on a shift at that time.')
  updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateShiftAssignmentSchema }) dto: UpdateShiftAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ShiftAssignment> {
    return this.shifts.updateAssignment(id, dto, actor);
  }

  @Delete('assignments/:id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a shift assignment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No assignment with that id.')
  removeAssignment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.shifts.removeAssignment(id, actor);
  }

  @Get('on-duty')
  @ApiOperation({ summary: 'Who is on shift', description: 'Everyone whose shift covers `at` (default: now), grouped by role.' })
  @ApiOkResponse({ standardSchema: OnDutySchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  onDuty(@Query({ schema: OnDutyQuerySchema }) query: OnDutyQuery): Promise<OnDuty> {
    return this.shifts.onDuty(query);
  }
}
