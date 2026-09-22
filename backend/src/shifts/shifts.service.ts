import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_SHIFT_OCCURRENCES,
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
import type { Prisma } from '../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { iso, orderBy, pageArgs, toPaginated } from '../common/list-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/transaction.js';
import { UnitOfWork } from '../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { datesBetween, zonedTimeToUtc } from './zoned-time.js';

const templateSelect = {
  id: true,
  name: true,
  startTime: true,
  durationMinutes: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShiftTemplateSelect;

type TemplateRecord = Prisma.ShiftTemplateGetPayload<{ select: typeof templateSelect }>;

const toTemplate = (row: TemplateRecord): ShiftTemplate => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const assignmentSelect = {
  id: true,
  role: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  template: { select: { id: true, name: true, color: true, startTime: true, durationMinutes: true } },
  user: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const satisfies Prisma.ShiftAssignmentSelect;

type AssignmentRecord = Prisma.ShiftAssignmentGetPayload<{ select: typeof assignmentSelect }>;

const toAssignment = (row: AssignmentRecord): ShiftAssignment => ({
  ...row,
  startsAt: iso(row.startsAt),
  endsAt: iso(row.endsAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  // ─── Templates ────────────────────────────────────────────────────────────

  async listTemplates(): Promise<ShiftTemplate[]> {
    const rows = await this.prisma.shiftTemplate.findMany({
      select: templateSelect,
      orderBy: [{ isActive: 'desc' }, { startTime: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toTemplate);
  }

  async createTemplate(dto: CreateShiftTemplateDto, actor: AuthUser): Promise<ShiftTemplate> {
    const row = await this.uow.run(async (tx) => {
      const template = await tx.shiftTemplate.create({ data: dto, select: templateSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_template.create',
          entityType: 'SHIFT_TEMPLATE',
          entityId: template.id,
          summary: `Created shift “${dto.name}” (${dto.startTime}, ${dto.durationMinutes / 60} h)`,
        },
        tx,
      );
      return template;
    });
    return toTemplate(row);
  }

  async updateTemplate(id: string, dto: UpdateShiftTemplateDto, actor: AuthUser): Promise<ShiftTemplate> {
    const current = await this.prisma.shiftTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Shift template not found');

    const row = await this.uow.run(async (tx) => {
      const template = await tx.shiftTemplate.update({ where: { id }, data: dto, select: templateSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_template.update',
          entityType: 'SHIFT_TEMPLATE',
          entityId: id,
          summary: `Updated shift “${template.name}”`,
          changes: diff(current, dto),
        },
        tx,
      );
      return template;
    });
    return toTemplate(row);
  }

  async removeTemplate(id: string, actor: AuthUser): Promise<void> {
    const template = await this.prisma.shiftTemplate.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assignments: true } } },
    });
    if (!template) throw new NotFoundException('Shift template not found');
    if (template._count.assignments > 0) {
      throw new ConflictException('This shift has been scheduled. Deactivate it instead.');
    }
    await this.uow.run(async (tx) => {
      await tx.shiftTemplate.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_template.delete',
          entityType: 'SHIFT_TEMPLATE',
          entityId: id,
          summary: `Deleted shift “${template.name}”`,
        },
        tx,
      );
    });
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  async listAssignments(query: ListShiftAssignmentsQuery): Promise<Paginated<ShiftAssignment>> {
    const where: Prisma.ShiftAssignmentWhereInput = {
      // Overlap with the window, so a night shift that started yesterday still shows today.
      ...(query.from && { endsAt: { gt: new Date(query.from) } }),
      ...(query.to && { startsAt: { lt: new Date(query.to) } }),
      ...(query.userId && { userId: { in: query.userId } }),
      ...(query.templateId && { templateId: { in: query.templateId } }),
      ...(query.role && { role: { in: query.role } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.findMany({
        where,
        select: assignmentSelect,
        orderBy: orderBy(query.sort, { startsAt: (direction) => ({ startsAt: direction }) }),
        ...pageArgs(query),
      }),
      this.prisma.shiftAssignment.count({ where }),
    ]);
    return toPaginated(rows.map(toAssignment), total, query);
  }

  /**
   * Schedules one person on a shift for one date, or — with `repeat` — on the
   * chosen weekdays up to a date. All or nothing: if any occurrence would
   * overlap one of their existing shifts, nothing is created.
   */
  async createAssignments(dto: CreateShiftAssignmentDto, actor: AuthUser): Promise<ShiftAssignment[]> {
    const [template, user] = await Promise.all([
      this.prisma.shiftTemplate.findUnique({ where: { id: dto.templateId } }),
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { name: true, isActive: true } }),
    ]);
    if (!template) throw new BadRequestException('Shift template not found');
    if (!template.isActive) throw new BadRequestException('This shift template is inactive');
    if (!user?.isActive) throw new BadRequestException('User not found or deactivated');

    const dates = dto.repeat ? datesBetween(dto.date, dto.repeat.until, dto.repeat.weekdays) : [dto.date];
    if (dates.length === 0) throw new BadRequestException('No dates match the chosen weekdays');
    if (dates.length > MAX_SHIFT_OCCURRENCES) {
      throw new BadRequestException(`That would create ${dates.length} shifts; the limit is ${MAX_SHIFT_OCCURRENCES}`);
    }

    const periods = dates.map((date) => {
      const startsAt = zonedTimeToUtc(date, template.startTime, dto.timeZone);
      return { date, startsAt, endsAt: new Date(startsAt.getTime() + template.durationMinutes * 60_000) };
    });

    const ids = await this.uow.run(async (tx) => {
      await this.assertNoOverlap(dto.userId, periods, tx);
      const created: string[] = [];
      for (const period of periods) {
        const row = await tx.shiftAssignment.create({
          data: {
            templateId: template.id,
            userId: dto.userId,
            role: dto.role,
            startsAt: period.startsAt,
            endsAt: period.endsAt,
            notes: dto.notes,
            createdById: actor.id,
          },
          select: { id: true },
        });
        created.push(row.id);
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.create',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: created.length === 1 ? created[0] : null,
          summary:
            created.length === 1
              ? `Scheduled ${user.name} on ${template.name}, ${dates[0]}`
              : `Scheduled ${user.name} on ${template.name}, ${created.length} shifts from ${dates[0]} to ${dates.at(-1)}`,
          changes: { userId: dto.userId, templateId: template.id, role: dto.role, dates },
        },
        tx,
      );
      return created;
    });

    const rows = await this.prisma.shiftAssignment.findMany({
      where: { id: { in: ids } },
      select: assignmentSelect,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toAssignment);
  }

  async updateAssignment(id: string, dto: UpdateShiftAssignmentDto, actor: AuthUser): Promise<ShiftAssignment> {
    const current = await this.prisma.shiftAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Shift assignment not found');

    const row = await this.uow.run(async (tx) => {
      if (dto.userId && dto.userId !== current.userId) {
        const user = await tx.user.findUnique({ where: { id: dto.userId }, select: { isActive: true } });
        if (!user?.isActive) throw new BadRequestException('User not found or deactivated');
        await this.assertNoOverlap(dto.userId, [current], tx);
      }
      const assignment = await tx.shiftAssignment.update({ where: { id }, data: dto, select: assignmentSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.update',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: id,
          summary: `Updated ${assignment.template.name} on ${iso(assignment.startsAt).slice(0, 10)} (${assignment.user.name})`,
          changes: diff(current, dto),
        },
        tx,
      );
      return assignment;
    });
    return toAssignment(row);
  }

  async removeAssignment(id: string, actor: AuthUser): Promise<void> {
    const assignment = await this.prisma.shiftAssignment.findUnique({ where: { id }, select: assignmentSelect });
    if (!assignment) throw new NotFoundException('Shift assignment not found');

    await this.uow.run(async (tx) => {
      await tx.shiftAssignment.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.delete',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: id,
          summary: `Removed ${assignment.user.name} from ${assignment.template.name} on ${iso(assignment.startsAt).slice(0, 10)}`,
        },
        tx,
      );
    });
  }

  /** Who is on shift at an instant — the question an alarm escalation asks. */
  async onDuty(query: OnDutyQuery): Promise<OnDuty> {
    const at = query.at ? new Date(query.at) : new Date();
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        startsAt: { lte: at },
        endsAt: { gt: at },
        ...(query.role && { role: { in: query.role } }),
      },
      select: assignmentSelect,
      orderBy: [{ role: 'asc' }, { startsAt: 'asc' }],
    });
    return { at: iso(at), items: rows.map(toAssignment) };
  }

  private async assertNoOverlap(
    userId: string,
    periods: Array<{ startsAt: Date; endsAt: Date }>,
    db: Db,
  ): Promise<void> {
    const clash = await db.shiftAssignment.findFirst({
      where: {
        userId,
        OR: periods.map((period) => ({ startsAt: { lt: period.endsAt }, endsAt: { gt: period.startsAt } })),
      },
      select: { startsAt: true, template: { select: { name: true } } },
    });
    if (clash) {
      throw new ConflictException(
        `Overlaps their ${clash.template.name} shift starting ${iso(clash.startsAt).slice(0, 16).replace('T', ' ')} UTC`,
      );
    }
  }
}
