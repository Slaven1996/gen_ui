import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  WIDGET_CONFIG_SCHEMAS,
  WIDGET_DEFAULT_SIZE,
  type CreateDashboardDto,
  type Dashboard,
  type DashboardDetail,
  type DashboardSource,
  type DashboardWidget,
  type SaveDashboardDto,
  type SaveWidgetDto,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { iso } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { planWidgetChanges } from './widget-changes.js';

const dashboardSelect = {
  id: true,
  ownerId: true,
  name: true,
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

type Access = { ownerId: string; isShared: boolean };

/** Only its owner changes a dashboard; shared ones are read-only for everyone else. */
const canEdit = (dashboard: Access, actor: AuthUser) => dashboard.ownerId === actor.id;

/** Its owner deletes it, and an admin may delete a shared one. */
const canDelete = (dashboard: Access, actor: AuthUser) =>
  dashboard.ownerId === actor.id || (actor.role === 'ADMIN' && dashboard.isShared);

/** Nobody sees another's private dashboard. */
const canView = (dashboard: Access, actor: AuthUser) => dashboard.ownerId === actor.id || dashboard.isShared;

function toDashboard(row: DashboardRecord, actor: AuthUser): Dashboard {
  return {
    id: row.id,
    name: row.name,
    isShared: row.isShared,
    owner: row.owner,
    canEdit: canEdit(row, actor),
    canDelete: canDelete(row, actor),
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

/** A widget's row; its config was parsed against its type by the request schema. */
function widgetData(widget: SaveWidgetDto, position: number) {
  return {
    title: widget.title,
    position,
    width: widget.width ?? WIDGET_DEFAULT_SIZE[widget.type].width,
    height: widget.height ?? WIDGET_DEFAULT_SIZE[widget.type].height,
    config: widget.config as Prisma.InputJsonValue,
  };
}

const widgetCount = (count: number) => (count === 1 ? '1 widget' : `${count} widgets`);

/** A dashboard saved from an assistant draft, by the call it came from. */
export interface DashboardFromDraft {
  toolCallId: string;
  id: string;
  name: string;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser): Promise<Dashboard[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: { OR: [{ ownerId: actor.id }, { isShared: true }] },
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

  /**
   * Creates a dashboard with its widgets, in one transaction. With `source`
   * (an assistant draft) the dashboard remembers the call it came from, once:
   * a second dashboard from the same draft is a 409.
   */
  async create(dto: CreateDashboardDto, actor: AuthUser): Promise<DashboardDetail> {
    const id = await this.uow.run(async (tx) => {
      const source = dto.source && (await ownSource(tx, dto.source, actor));
      if (source) {
        const existing = await tx.dashboard.findFirst({
          where: { sourceConversationId: source.conversationId, sourceToolCallId: source.toolCallId },
          select: { name: true },
        });
        if (existing) throw new ConflictException(`This draft was already saved as “${existing.name}”.`);
      }
      const dashboard = await tx.dashboard.create({
        data: {
          ownerId: actor.id,
          name: dto.name,
          isShared: dto.isShared,
          sourceConversationId: source?.conversationId ?? null,
          sourceToolCallId: source?.toolCallId ?? null,
        },
        select: { id: true },
      });
      if (dto.widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: dto.widgets.map((widget, position) => ({
            dashboardId: dashboard.id,
            type: widget.type,
            ...widgetData(widget, position),
          })),
        });
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'dashboard.create',
          entityType: 'DASHBOARD',
          entityId: dashboard.id,
          summary: `Created dashboard “${dto.name}” with ${widgetCount(dto.widgets.length)}${source ? ' from an assistant draft' : ''}`,
        },
        tx,
      );
      return dashboard.id;
    });
    return this.get(id, actor);
  }

  /**
   * Saves a whole dashboard: its name, sharing and widgets, in one
   * transaction. Widgets with an id are kept, the others are new, and those
   * left out are removed. Each change of content is audited; moves and
   * resizes are arrangement, not content, and are not.
   */
  async replace(id: string, dto: SaveDashboardDto, actor: AuthUser): Promise<DashboardDetail> {
    const current = await this.editable(id, actor);
    await this.uow.run(async (tx) => {
      const rows = await tx.dashboardWidget.findMany({ where: { dashboardId: id }, select: widgetSelect });
      const plan = planWidgetChanges(rows.map(toWidget), dto.widgets);
      if ('error' in plan) throw new BadRequestException(plan.error);

      await tx.dashboard.update({ where: { id }, data: { name: dto.name, isShared: dto.isShared, updatedAt: new Date() } });
      if (plan.remove.length > 0) {
        await tx.dashboardWidget.deleteMany({ where: { id: { in: plan.remove.map((widget) => widget.id) } } });
      }
      for (const { before, after, position } of plan.update) {
        await tx.dashboardWidget.update({ where: { id: before.id }, data: widgetData(after, position) });
      }
      if (plan.create.length > 0) {
        await tx.dashboardWidget.createMany({
          data: plan.create.map(({ widget, position }) => ({ dashboardId: id, type: widget.type, ...widgetData(widget, position) })),
        });
      }

      const record = (action: string, summary: string, changes?: Record<string, unknown> | null) =>
        this.audit.record({ actorId: actor.id, action, entityType: 'DASHBOARD', entityId: id, summary, changes }, tx);
      const settings = diff({ name: current.name, isShared: current.isShared }, { name: dto.name, isShared: dto.isShared });
      if (settings) await record('dashboard.update', `Updated dashboard “${dto.name}”`, settings);
      for (const { widget } of plan.create) {
        await record('dashboard.widget_add', `Added widget “${widget.title}” to “${dto.name}”`, {
          type: widget.type,
          config: widget.config,
        });
      }
      for (const { before, after } of plan.update) {
        // Against the parsed config, so key order and filled-in defaults don't read as changes.
        const changes = diff({ title: before.title, config: before.config }, { title: after.title, config: after.config });
        if (changes) await record('dashboard.widget_update', `Updated widget “${after.title}” on “${dto.name}”`, changes);
      }
      for (const widget of plan.remove) {
        await record('dashboard.widget_remove', `Removed widget “${widget.title}” from “${dto.name}”`);
      }
    });
    return this.get(id, actor);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const dashboard = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!dashboard || !canView(dashboard, actor)) throw new NotFoundException('Dashboard not found');
    if (!canDelete(dashboard, actor)) {
      throw new ForbiddenException('Only its owner, or an admin for a shared dashboard, can delete it');
    }
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

  /**
   * The dashboards saved from drafts in this conversation, by the call each
   * came from. A deleted dashboard is simply not here, so its draft reads as
   * not created again. The caller checks the conversation is the user's.
   */
  async createdFrom(conversationId: string): Promise<DashboardFromDraft[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: { sourceConversationId: conversationId },
      select: { id: true, name: true, sourceToolCallId: true },
    });
    return rows.flatMap((row) => (row.sourceToolCallId ? [{ toolCallId: row.sourceToolCallId, id: row.id, name: row.name }] : []));
  }

  private async editable(id: string, actor: AuthUser) {
    const dashboard = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!dashboard || !canView(dashboard, actor)) throw new NotFoundException('Dashboard not found');
    if (!canEdit(dashboard, actor)) throw new ForbiddenException('Only its owner can change this dashboard');
    return dashboard;
  }
}

/**
 * The draft a dashboard is saved from, if its conversation is the caller's.
 * Otherwise (a chat cleared since, or someone else's id) the dashboard is
 * saved without it.
 */
async function ownSource(tx: Db, source: DashboardSource, actor: AuthUser): Promise<DashboardSource | undefined> {
  const owned = await tx.conversation.count({ where: { id: source.conversationId, userId: actor.id } });
  return owned > 0 ? source : undefined;
}
