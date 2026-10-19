import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
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
  DashboardDetailSchema,
  DashboardsSchema,
  SaveDashboardSchema,
  type CreateDashboardDto,
  type Dashboard,
  type DashboardDetail,
  type SaveDashboardDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { DashboardsService } from './dashboards.service.js';

const NOT_EDITABLE = 'Only its owner can change it; a shared dashboard is read-only for everyone else.';
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
    description:
      'Your own dashboards (first) and those others have shared. `canEdit` says whether you may change each one (only its owner), `canDelete` whether you may delete it (its owner, or an admin when it is shared).',
  })
  @ApiOkResponse({ standardSchema: DashboardsSchema })
  async list(@CurrentUser() actor: AuthUser): Promise<{ items: Dashboard[] }> {
    return { items: await this.dashboards.list(actor) };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a dashboard',
    description:
      'A whole dashboard in one request: its name, whether it is shared, and its widgets in grid order. Each `config` is validated against its widget `type`; width and height default by type. `source` names the assistant draft it is saved from (`GET /ai/conversations/:id/dashboard-drafts/:toolCallId`), so the chat shows that draft as created; it is kept only for a conversation of yours.',
  })
  @ApiCreatedResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(400, 'A field is invalid, or a config does not fit its widget type.')
  @ApiErrorResponse(409, 'A dashboard was already saved from this draft.')
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

  @Put(':id')
  @ApiOperation({
    summary: 'Save a dashboard',
    description:
      'Replaces its name, sharing and widgets in one transaction. A widget with an `id` is kept and updated (its type is fixed), one without is added, and one left out is removed. Order in `widgets` is the order on the grid.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DashboardDetailSchema })
  @ApiErrorResponse(
    400,
    'A field is invalid, a config does not fit its widget type, a widget id is not on this dashboard, or a widget’s type changed.',
  )
  @ApiErrorResponse(403, NOT_EDITABLE)
  @ApiErrorResponse(404, NOT_FOUND)
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: SaveDashboardSchema }) dto: SaveDashboardDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<DashboardDetail> {
    return this.dashboards.replace(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dashboard', description: 'Its owner may, and an admin may delete a shared one.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted, with its widgets.' })
  @ApiErrorResponse(403, 'Only its owner, or an admin for a shared dashboard, can delete it.')
  @ApiErrorResponse(404, NOT_FOUND)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.dashboards.remove(id, actor);
  }
}
