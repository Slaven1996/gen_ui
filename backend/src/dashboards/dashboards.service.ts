import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  WIDGET_CONFIG_SCHEMAS,
  WIDGET_DEFAULT_SIZE,
  type CreateDashboardDto,
  type CreateWidgetDto,
  type Dashboard,
  type DashboardDetail,
  type DashboardWidget,
  type ListDashboardsQuery,
  type UpdateDashboardDto,
  type UpdateLayoutDto,
  type UpdateWidgetDto,
  type WidgetType,
} from '@gen-ui/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, iso } from '../common/list-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnitOfWork } from '../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { OPERATIONS_TEMPLATE } from './dashboard-templates.js';

const dashboardSelect = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  isShared: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
  _count: { select: { widgets: true } },
} as const satisfies Prisma.DashboardSelect;

type DashboardRecord = Prisma.DashboardGetPayload<{ select: typeof dashboardSelect }>;

const widgetSelect = {
  id: true,
  dashboardId: true,
  type: true,
  title: true,
  position: true,
  width: true,
  height: true,
  config: true,
} as const satisfies Prisma.DashboardWidgetSelect;

type WidgetRecord = Prisma.DashboardWidgetGetPayload<{ select: typeof widgetSelect }>;

/** Owners edit their dashboards; admins may also edit shared ones. Nobody sees another's private dashboard. */
const canEdit = (dashboard: { ownerId: string; isShared: boolean }, actor: AuthUser) =>
  dashboard.ownerId === actor.id || (actor.role === 'ADMIN' && dashboard.isShared);

const canView = (dashboard: { ownerId: string; isShared: boolean }, actor: AuthUser) =>
  dashboard.ownerId === actor.id || dashboard.isShared;

function toDashboard(row: DashboardRecord, actor: AuthUser): Dashboard {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isShared: row.isShared,
    owner: row.owner,
    canEdit: canEdit(row, actor),
    widgetCount: row._count.widgets,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Config is validated on write; parsing again on read fills in defaults added
 * to a widget type since the widget was saved.
 */
function toWidget(row: WidgetRecord): DashboardWidget {
  const parsed = WIDGET_CONFIG_SCHEMAS[row.type].safeParse(row.config);
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    type: row.type,
    title: row.title,
    position: row.position,
    width: row.width,
    height: row.height,
    config: parsed.success ? parsed.data : row.config,
  } as DashboardWidget;
}

function parseConfig(type: WidgetType, config: unknown): Prisma.InputJsonValue {
  const parsed = WIDGET_CONFIG_SCHEMAS[type].safeParse(config);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues.map((issue) => `config.${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return parsed.data as Prisma.InputJsonValue;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListDashboardsQuery, actor: AuthUser): Promise<Dashboard[]> {
    const visibility: Prisma.DashboardWhereInput =
      query.scope === 'mine'
        ? { ownerId: actor.id }
        : query.scope === 'shared'
          ? { isShared: true, ownerId: { not: actor.id } }
          : { OR: [{ ownerId: actor.id }, { isShared: true }] };
    const rows = await this.prisma.dashboard.findMany({
      where: { ...visibility, ...(query.search && { name: insensitive(query.search) }) },
      select: dashboardSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    // The caller's own dashboards first.
    return rows
      .map((row) => toDashboard(row, actor))
      .sort((a, b) => Number(b.owner.id === actor.id) - Number(a.owner.id === actor.id));
  }

  async get(id: string, actor: AuthUser): Promise<DashboardDetail> {
    const row = await this.prisma.dashboard.findUnique({
      where: { id },
      select: { ...dashboardSelect, widgets: { select: widgetSelect, orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    if (!row || !canView(row, actor)) throw new NotFoundException('Dashboard not found');
    return { ...toDashboard(row, actor), widgets: row.widgets.map(toWidget) };
  }

  async create(dto: CreateDashboardDto, actor: AuthUser): Promise<DashboardDetail> {
    const id = await this.uow.run(async (tx) => {
      const dashboard = await tx.dashboard.create({
        data: { ownerId: actor.id, name: dto.name, description: dto.description, isShared: dto.isShared },
        select: { id: true },
      });
      if (dto.template === 'operations') {
        await tx.dashboardWidget.createMany({
          data: OPERATIONS_TEMPLATE.map((widget, position) => ({
            dashboardId: dashboard.id,
            type: widget.type,
            title: widget.title,
            position,
            width: widget.width ?? WIDGET_DEFAULT_SIZE[widget.type].width,
            height: widget.height ?? WIDGET_DEFAULT_SIZE[widget.type].height,
            config: parseConfig(widget.type, widget.config),
          })),
        });
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.create',
          entityType: 'DASHBOARD',
          entityId: dashboard.id,
          summary: `Created dashboard “${dto.name}”${dto.template === 'blank' ? '' : ` from the ${dto.template} template`}`,
        },
        tx,
      );
      return dashboard.id;
    });
    return this.get(id, actor);
  }

  async update(id: string, dto: UpdateDashboardDto, actor: AuthUser): Promise<DashboardDetail> {
    const current = await this.editable(id, actor);
    await this.uow.run(async (tx) => {
      await tx.dashboard.update({ where: { id }, data: dto });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.update',
          entityType: 'DASHBOARD',
          entityId: id,
          summary: `Updated dashboard “${dto.name ?? current.name}”`,
          changes: diff(current, dto),
        },
        tx,
      );
    });
    return this.get(id, actor);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const dashboard = await this.editable(id, actor);
    await this.uow.run(async (tx) => {
      await tx.dashboard.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.delete',
          entityType: 'DASHBOARD',
          entityId: id,
          summary: `Deleted dashboard “${dashboard.name}”`,
        },
        tx,
      );
    });
  }

  async addWidget(dashboardId: string, dto: CreateWidgetDto, actor: AuthUser): Promise<DashboardWidget> {
    const dashboard = await this.editable(dashboardId, actor);
    const row = await this.uow.run(async (tx) => {
      const last = await tx.dashboardWidget.aggregate({ where: { dashboardId }, _max: { position: true } });
      const widget = await tx.dashboardWidget.create({
        data: {
          dashboardId,
          type: dto.type,
          title: dto.title,
          position: (last._max.position ?? -1) + 1,
          width: dto.width ?? WIDGET_DEFAULT_SIZE[dto.type].width,
          height: dto.height ?? WIDGET_DEFAULT_SIZE[dto.type].height,
          config: dto.config as Prisma.InputJsonValue,
        },
        select: widgetSelect,
      });
      await tx.dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.widget_add',
          entityType: 'DASHBOARD',
          entityId: dashboardId,
          summary: `Added widget “${dto.title}” to “${dashboard.name}”`,
          changes: { type: dto.type, config: dto.config },
        },
        tx,
      );
      return widget;
    });
    return toWidget(row);
  }

  async updateWidget(
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetDto,
    actor: AuthUser,
  ): Promise<DashboardWidget> {
    await this.editable(dashboardId, actor);
    const widget = await this.prisma.dashboardWidget.findFirst({ where: { id: widgetId, dashboardId } });
    if (!widget) throw new NotFoundException('Widget not found');

    const row = await this.prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.config !== undefined && { config: parseConfig(widget.type, dto.config) }),
      },
      select: widgetSelect,
    });
    return toWidget(row);
  }

  async removeWidget(dashboardId: string, widgetId: string, actor: AuthUser): Promise<void> {
    const dashboard = await this.editable(dashboardId, actor);
    const widget = await this.prisma.dashboardWidget.findFirst({ where: { id: widgetId, dashboardId } });
    if (!widget) throw new NotFoundException('Widget not found');

    await this.uow.run(async (tx) => {
      await tx.dashboardWidget.delete({ where: { id: widgetId } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.widget_remove',
          entityType: 'DASHBOARD',
          entityId: dashboardId,
          summary: `Removed widget “${widget.title}” from “${dashboard.name}”`,
        },
        tx,
      );
    });
  }

  /** Moves and resizes widgets in one transaction. Not audited: it is arrangement, not content. */
  async updateLayout(dashboardId: string, dto: UpdateLayoutDto, actor: AuthUser): Promise<DashboardDetail> {
    await this.editable(dashboardId, actor);
    const ids = dto.widgets.map((widget) => widget.id);
    const owned = await this.prisma.dashboardWidget.count({ where: { id: { in: ids }, dashboardId } });
    if (owned !== new Set(ids).size) throw new BadRequestException('Every widget must belong to this dashboard');

    await this.uow.run(async (tx) => {
      for (const widget of dto.widgets) {
        await tx.dashboardWidget.update({
          where: { id: widget.id },
          data: { position: widget.position, width: widget.width, height: widget.height },
        });
      }
      await tx.dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });
    });
    return this.get(dashboardId, actor);
  }

  private async editable(id: string, actor: AuthUser) {
    const dashboard = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!dashboard || !canView(dashboard, actor)) throw new NotFoundException('Dashboard not found');
    if (!canEdit(dashboard, actor)) throw new ForbiddenException('Only the owner can change this dashboard');
    return dashboard;
  }
}
