import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
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
  CreateDashboardSchema,
  CreateWidgetSchema,
  DashboardDetailSchema,
  DashboardsSchema,
  DashboardWidgetSchema,
  ListDashboardsQuerySchema,
  UpdateDashboardSchema,
  UpdateLayoutSchema,
  UpdateWidgetSchema,
  type CreateDashboardDto,
  type CreateWidgetDto,
  type Dashboard,
  type DashboardDetail,
  type DashboardWidget,
  type ListDashboardsQuery,
  type UpdateDashboardDto,
  type UpdateLayoutDto,
  type UpdateWidgetDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { DashboardsService } from './dashboards.service.js';

const NOT_EDITABLE = 'Only the owner (or, for a shared dashboard, an admin) can change it.';
const NOT_FOUND = 'No dashboard with that id that you can see.';

@ApiTags('Dashboards')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @ApiOperation({
    summary: 'List dashboards',
    description: 'Your own dashboards (first) and those others have shared. `canEdit` says whether you may change each one.',
  })
  @ApiOkResponse({ standardSchema: DashboardsSchema })
  async list(
    @Query({ schema: ListDashboardsQuerySchema }) query: ListDashboardsQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ items: Dashboard[] }> {
    return { items: await this.dashboards.list(query, actor) };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a dashboard',
    description: '`template: "operations"` starts with a ready-made layout; `blank` starts empty.',
  })
  @ApiCreatedResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(400, 'A field is invalid.')
  create(@Body({ schema: CreateDashboardSchema }) dto: CreateDashboardDto, @CurrentUser() actor: AuthUser): Promise<DashboardDetail> {
    return this.dashboards.create(dto, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a dashboard with its widgets',
    description: 'Widgets in grid order. Each widget’s `config` is the query its view runs — the same parameters as the matching list endpoint.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(404, NOT_FOUND)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<DashboardDetail> {
    return this.dashboards.get(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, describe or share a dashboard' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(400, 'No fields sent, or a field is invalid.')
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, NOT_FOUND)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateDashboardSchema }) dto: UpdateDashboardDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<DashboardDetail> {
    return this.dashboards.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dashboard' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted, with its widgets.' })
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, NOT_FOUND)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.dashboards.remove(id, actor);
  }

  @Put(':id/layout')
  @ApiOperation({
    summary: 'Arrange widgets',
    description: 'Positions and sizes for the widgets you send, applied together. Widgets left out keep their place.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(400, 'A size is invalid, or a widget belongs to another dashboard.')
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, NOT_FOUND)
  updateLayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateLayoutSchema }) dto: UpdateLayoutDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<DashboardDetail> {
    return this.dashboards.updateLayout(id, dto, actor);
  }

  @Post(':id/widgets')
  @ApiOperation({
    summary: 'Add a widget',
    description: 'Appended at the end of the grid. `config` is validated against `type`; width and height default by type.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ standardSchema: DashboardWidgetSchema })
  @ApiErrorResponse(400, 'The type is unknown, or the config does not fit it.')
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, NOT_FOUND)
  addWidget(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: CreateWidgetSchema }) dto: CreateWidgetDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<DashboardWidget> {
    return this.dashboards.addWidget(id, dto, actor);
  }

  @Patch(':id/widgets/:widgetId')
  @ApiOperation({ summary: 'Update a widget', description: 'Title, size or config. A widget’s type is fixed; `config` is checked against it.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'widgetId', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DashboardWidgetSchema })
  @ApiErrorResponse(400, 'No fields sent, or the config does not fit the widget type.')
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, 'No such dashboard or widget.')
  updateWidget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body({ schema: UpdateWidgetSchema }) dto: UpdateWidgetDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<DashboardWidget> {
    return this.dashboards.updateWidget(id, widgetId, dto, actor);
  }

  @Delete(':id/widgets/:widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a widget' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'widgetId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, 'No such dashboard or widget.')
  removeWidget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.dashboards.removeWidget(id, widgetId, actor);
  }
}
