import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  calendarWindow,
  datesBetween,
  localPeriod,
  MAX_COPIED_SHIFTS,
  MAX_SHIFT_OCCURRENCES,
  normalizeCoverage,
  SHIFT_TIME_FIELDS,
  shiftPeriod,
  startOfWeek,
  zonedDate,
  zonedDay,
  zonedTime,
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
  type ShiftScope,
  type ShiftTemplate,
  type UpdateShiftAssignmentDto,
  type UpdateShiftTemplateDto,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { iso, orderBy, pageArgs, toPaginated } from '../../common/list-query.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { computeCoverage } from './coverage.js';
import { planCopy } from './copy-plan.js';
import {
  assignmentSelect,
  readCoverage,
  templateSelect,
  toAssignment,
  toTemplate,
  type AssignmentRecord,
} from './shifts.mapper.js';

interface Period {
  startsAt: Date;
  endsAt: Date;
}

const DAY_MS = 86_400_000;

/**
 * Shift templates, the people scheduled on them and who is on duty. Every
 * date and wall-clock time is in the plant time zone (`SHIFT_TIME_ZONE`):
 * a template's "06:00" is 06:00 there, and a shift belongs to the day it
 * starts on there.
 */
@Injectable()
export class ShiftsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.timeZone = config.get('SHIFT_TIME_ZONE');
  }

  private readonly toAssignment = (row: AssignmentRecord): ShiftAssignment => toAssignment(row, this.timeZone);

  // ─── Templates ────────────────────────────────────────────────────────────

  async listTemplates(): Promise<ShiftTemplate[]> {
    const rows = await this.prisma.shiftTemplate.findMany({
      select: templateSelect,
      orderBy: [{ isActive: 'desc' }, { startTime: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toTemplate);
  }

  async createTemplate(dto: CreateShiftTemplateDto, actor: AuthUser): Promise<ShiftTemplate> {
    const { coverage, ...fields } = dto;
    const row = await this.uow.run(async (tx) => {
      const template = await tx.shiftTemplate.create({
        data: { ...fields, coverage: normalizeCoverage(coverage) as Prisma.InputJsonValue },
        select: templateSelect,
      });
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

    const { coverage: coverageInput, ...fields } = dto;
    const coverage = coverageInput && normalizeCoverage(coverageInput);
    const row = await this.uow.run(async (tx) => {
      const template = await tx.shiftTemplate.update({
        where: { id },
        data: { ...fields, ...(coverage && { coverage: coverage as Prisma.InputJsonValue }) },
        select: templateSelect,
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_template.update',
          entityType: 'SHIFT_TEMPLATE',
          entityId: id,
          summary: `Updated shift “${template.name}”`,
          // Both sides normalised, so JSONB's key order never shows as a change.
          changes: diff({ ...current, coverage: readCoverage(current.coverage) }, { ...fields, coverage }),
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

  // ─── Calendar ─────────────────────────────────────────────────────────────

  /**
   * One month, week or day of the plan: its days (real instants, so 23 or 25
   * hours across a DST change), the shifts overlapping it — including the
   * night that started the evening before — and every staffing target in it.
   * Targets ignore the people filter, so a filtered view still shows gaps.
   */
  async calendar(query: ShiftCalendarQuery): Promise<ShiftCalendar> {
    const timeZone = this.timeZone;
    const date = query.date ?? zonedDate(new Date(), timeZone);
    const window = calendarWindow(query.view, date);
    const dates = datesBetween(window.from, window.to);
    const days = dates.map((day) => {
      const { start, end } = zonedDay(day, timeZone);
      return { date: day, startsAt: iso(start), endsAt: iso(end) };
    });

    const [templateRows, rows] = await this.prisma.$transaction([
      this.prisma.shiftTemplate.findMany({
        where: query.templateId && { id: { in: query.templateId } },
        select: templateSelect,
        orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.shiftAssignment.findMany({
        where: {
          endsAt: { gt: zonedDay(window.from, timeZone).start },
          startsAt: { lt: zonedDay(window.to, timeZone).end },
          ...(query.templateId && { templateId: { in: query.templateId } }),
          ...(query.role && { role: { in: query.role } }),
        },
        select: assignmentSelect,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const items = rows.map(this.toAssignment);
    const scheduled = new Set(items.map((item) => item.template.id));
    const templates = templateRows.map(toTemplate).filter((template) => template.isActive || scheduled.has(template.id));
    const coverage = computeCoverage(
      dates,
      templates.filter((template) => template.isActive),
      items.map((item) => ({ date: item.date, templateId: item.template.id, role: item.role, active: item.user.isActive })),
      query.role,
    );
    const userIds = query.userId;

    return {
      timeZone,
      view: query.view,
      date,
      from: window.from,
      to: window.to,
      days,
      templates,
      items: userIds ? items.filter((item) => userIds.includes(item.user.id)) : items,
      coverage,
    };
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  async listAssignments(query: ListShiftAssignmentsQuery): Promise<Paginated<ShiftAssignment>> {
    if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
      throw new BadRequestException('`from` must be before `to`');
    }
    const where: Prisma.ShiftAssignmentWhereInput = {
      // Overlap with the window, so a night shift that started yesterday still shows today.
      ...(query.from && { endsAt: { gt: new Date(query.from) } }),
      ...(query.to && { startsAt: { lt: new Date(query.to) } }),
      ...(query.userId && { userId: { in: query.userId } }),
      ...(query.templateId && { templateId: { in: query.templateId } }),
      ...(query.role && { role: { in: query.role } }),
      ...(query.seriesId && { seriesId: query.seriesId }),
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
    return toPaginated(rows.map(this.toAssignment), total, query);
  }

  /**
   * Schedules one person on a shift for one date, or — with `repeat` — on the
   * chosen weekdays up to a date, as one series. All or nothing: if any
   * occurrence would overlap one of their existing shifts, nothing is created.
   */
  async createAssignments(dto: CreateShiftAssignmentDto, actor: AuthUser): Promise<ShiftChangeResult> {
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

    const startTime = dto.startTime ?? template.startTime;
    const durationMinutes = dto.durationMinutes ?? template.durationMinutes;
    const custom = startTime !== template.startTime || durationMinutes !== template.durationMinutes;
    const seriesId = dates.length > 1 ? randomUUID() : null;
    const rows = dates.map((date) => ({
      id: randomUUID(),
      seriesId,
      templateId: template.id,
      userId: dto.userId,
      role: dto.role,
      ...shiftPeriod(date, startTime, durationMinutes, this.timeZone),
      notes: dto.notes,
      createdById: actor.id,
    }));

    await this.uow.run(async (tx) => {
      await this.assertNoOverlap(dto.userId, rows, tx);
      await tx.shiftAssignment.createMany({ data: rows });
      const hours = custom ? ` (${startTime}, ${durationMinutes / 60} h)` : '';
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.create',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: rows.length === 1 ? rows[0]?.id : null,
          summary:
            rows.length === 1
              ? `Scheduled ${user.name} on ${template.name}${hours}, ${dates[0]}`
              : `Scheduled ${user.name} on ${template.name}${hours}, ${rows.length} shifts from ${dates[0]} to ${dates.at(-1)}`,
          changes: { userId: dto.userId, templateId: template.id, role: dto.role, startTime, durationMinutes, dates },
        },
        tx,
      );
    });

    return { items: await this.findByIds(rows.map((row) => row.id)), skipped: 0 };
  }

  /**
   * Changes one shift, or with a wider `scope` the rest (`following`) or all
   * (`series`) of its series that haven't started yet. Only `scope=one` may
   * move a shift in time; doing so, or handing it to someone else, takes it
   * out of its series. Handing `following` to someone else splits the series.
   */
  async updateAssignment(
    id: string,
    dto: UpdateShiftAssignmentDto,
    scope: ShiftScope,
    actor: AuthUser,
  ): Promise<ShiftChangeResult> {
    const current = await this.prisma.shiftAssignment.findUnique({ where: { id }, select: assignmentSelect });
    if (!current) throw new NotFoundException('Shift assignment not found');

    const movesInTime = SHIFT_TIME_FIELDS.some((field) => dto[field] !== undefined);
    if (movesInTime && scope !== 'one') {
      throw new BadRequestException('Change the day, time or shift of one shift at a time (scope=one)');
    }
    const { rows, skipped } = await this.scopeRows(current, scope);
    if (rows.length === 0) return { items: [], skipped };

    const reassigns = dto.userId !== undefined && dto.userId !== current.user.id;
    if (reassigns) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { isActive: true } });
      if (!user?.isActive) throw new BadRequestException('User not found or deactivated');
    }

    let template = current.template;
    let period: Period | undefined;
    if (movesInTime) {
      if (dto.templateId && dto.templateId !== current.template.id) {
        const next = await this.prisma.shiftTemplate.findUnique({
          where: { id: dto.templateId },
          select: { id: true, name: true, color: true, startTime: true, durationMinutes: true, isActive: true },
        });
        if (!next) throw new BadRequestException('Shift template not found');
        if (!next.isActive) throw new BadRequestException('This shift template is inactive');
        template = next;
      }
      // Unchanged parts keep their current local values; a new template brings its own times.
      const local = localPeriod(current.startsAt, current.endsAt, this.timeZone);
      const newTemplate = template.id !== current.template.id;
      period = shiftPeriod(
        dto.date ?? local.date,
        dto.startTime ?? (newTemplate ? template.startTime : local.startTime),
        dto.durationMinutes ?? (newTemplate ? template.durationMinutes : local.durationMinutes),
        this.timeZone,
      );
    }

    const seriesId =
      scope === 'one' && current.seriesId && (movesInTime || reassigns)
        ? null
        : scope === 'following' && current.seriesId && reassigns
          ? randomUUID()
          : undefined;
    const data: Prisma.ShiftAssignmentUncheckedUpdateManyInput = {
      ...(dto.userId !== undefined && { userId: dto.userId }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(period && { templateId: template.id, startsAt: period.startsAt, endsAt: period.endsAt }),
      ...(seriesId !== undefined && { seriesId }),
    };
    const ids = rows.map((row) => row.id);

    await this.uow.run(async (tx) => {
      if (reassigns || period) {
        await this.assertNoOverlap(dto.userId ?? current.user.id, period ? [period] : rows, tx, ids);
      }
      await tx.shiftAssignment.updateMany({ where: { id: { in: ids } }, data });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.update',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: rows.length === 1 ? rows[0].id : null,
          summary:
            rows.length === 1
              ? `Updated ${current.user.name}’s ${current.template.name} shift on ${zonedDate(rows[0].startsAt, this.timeZone)}`
              : `Updated ${rows.length} of ${current.user.name}’s ${current.template.name} shifts, ${this.dateSpan(rows)}`,
          changes: diff(
            {
              userId: current.user.id,
              role: current.role,
              notes: current.notes,
              templateId: current.template.id,
              startsAt: current.startsAt,
              endsAt: current.endsAt,
            },
            {
              userId: dto.userId,
              role: dto.role,
              notes: dto.notes,
              ...(period && { templateId: template.id, startsAt: period.startsAt, endsAt: period.endsAt }),
            },
          ),
        },
        tx,
      );
    });

    return { items: await this.findByIds(ids), skipped };
  }

  /** Removes one shift, or the rest or all of its series that haven't started yet. */
  async removeAssignment(id: string, scope: ShiftScope, actor: AuthUser): Promise<ShiftRemoveResult> {
    const current = await this.prisma.shiftAssignment.findUnique({ where: { id }, select: assignmentSelect });
    if (!current) throw new NotFoundException('Shift assignment not found');

    const { rows, skipped } = await this.scopeRows(current, scope);
    if (rows.length === 0) return { removed: 0, skipped };

    await this.uow.run(async (tx) => {
      await tx.shiftAssignment.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.delete',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: rows.length === 1 ? rows[0].id : null,
          summary:
            rows.length === 1
              ? `Removed ${current.user.name} from ${current.template.name} on ${zonedDate(rows[0].startsAt, this.timeZone)}`
              : `Removed ${rows.length} of ${current.user.name}’s ${current.template.name} shifts, ${this.dateSpan(rows)}`,
        },
        tx,
      );
    });
    return { removed: rows.length, skipped };
  }

  /**
   * Repeats one week's plan in each of the `weeks` weeks after it, at the
   * same local times. Shifts of deactivated people or inactive templates are
   * left out. All or nothing: if any copy would overlap a shift already
   * planned for that person, nothing is created and the clashes are listed.
   */
  async copyWeek(dto: CopyShiftWeekDto, actor: AuthUser): Promise<ShiftChangeResult> {
    const monday = startOfWeek(dto.week);
    const sources = await this.prisma.shiftAssignment.findMany({
      where: {
        startsAt: { gte: zonedDay(monday, this.timeZone).start, lt: zonedDay(addDays(monday, 6), this.timeZone).end },
        ...(dto.userId && { userId: { in: dto.userId } }),
        ...(dto.templateId && { templateId: { in: dto.templateId } }),
      },
      select: {
        templateId: true,
        userId: true,
        role: true,
        notes: true,
        startsAt: true,
        endsAt: true,
        user: { select: { isActive: true } },
        template: { select: { isActive: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    const usable = sources.filter((source) => source.user.isActive && source.template.isActive);
    if (usable.length === 0) throw new BadRequestException('There are no shifts to copy in that week');

    const rows = usable.flatMap((source) => {
      // Each shift's copies form a series, so "remove the following" works on them.
      const seriesId = randomUUID();
      return planCopy(source, dto.weeks, this.timeZone).map((period) => ({
        id: randomUUID(),
        seriesId,
        templateId: source.templateId,
        userId: source.userId,
        role: source.role,
        notes: source.notes,
        ...period,
        createdById: actor.id,
      }));
    });
    if (rows.length > MAX_COPIED_SHIFTS) {
      throw new BadRequestException(`That would create ${rows.length} shifts; the limit is ${MAX_COPIED_SHIFTS}`);
    }

    await this.uow.run(async (tx) => {
      const clashes = await tx.shiftAssignment.findMany({
        where: { OR: rows.map((row) => ({ userId: row.userId, startsAt: { lt: row.endsAt }, endsAt: { gt: row.startsAt } })) },
        select: { startsAt: true, user: { select: { name: true } }, template: { select: { name: true } } },
        orderBy: { startsAt: 'asc' },
      });
      if (clashes.length > 0) {
        const examples = clashes
          .slice(0, 3)
          .map((clash) => `${clash.user.name}, ${clash.template.name} on ${zonedDate(clash.startsAt, this.timeZone)}`);
        const more = clashes.length > 3 ? ` and ${clashes.length - 3} more` : '';
        throw new ConflictException(`The copies overlap shifts already planned: ${examples.join('; ')}${more}`);
      }
      await tx.shiftAssignment.createMany({ data: rows });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'shift_assignment.create',
          entityType: 'SHIFT_ASSIGNMENT',
          entityId: null,
          summary: `Copied the week of ${monday} into the next ${dto.weeks === 1 ? 'week' : `${dto.weeks} weeks`}: ${rows.length} shifts`,
          changes: { week: monday, weeks: dto.weeks, userId: dto.userId, templateId: dto.templateId, shifts: rows.length },
        },
        tx,
      );
    });

    return { items: await this.findByIds(rows.map((row) => row.id)), skipped: sources.length - usable.length };
  }

  // ─── On duty ──────────────────────────────────────────────────────────────

  /** Who is on shift at an instant — the question an alarm escalation asks — and who takes over next. */
  async onDuty(query: OnDutyQuery): Promise<OnDuty> {
    const at = query.at ? new Date(query.at) : new Date();
    const where: Prisma.ShiftAssignmentWhereInput = {
      user: { isActive: true },
      ...(query.role && { role: { in: query.role } }),
    };
    const [rows, upcoming] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.findMany({
        where: { ...where, startsAt: { lte: at }, endsAt: { gt: at } },
        select: assignmentSelect,
        orderBy: [{ role: 'asc' }, { startsAt: 'asc' }],
      }),
      this.prisma.shiftAssignment.findFirst({
        where: { ...where, startsAt: { gt: at, lte: new Date(at.getTime() + DAY_MS) } },
        select: { startsAt: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const next = upcoming
      ? await this.prisma.shiftAssignment.findMany({
          where: { ...where, startsAt: upcoming.startsAt },
          select: assignmentSelect,
          orderBy: [{ role: 'asc' }, { id: 'asc' }],
        })
      : [];
    return {
      at: iso(at),
      timeZone: this.timeZone,
      items: rows.map(this.toAssignment),
      next: next.map(this.toAssignment),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * The shifts a scoped change applies to. `following`/`series` skip shifts
   * that already started, so on-duty history stays as it was; a shift outside
   * any series is just itself.
   */
  private async scopeRows(
    current: AssignmentRecord,
    scope: ShiftScope,
  ): Promise<{ rows: AssignmentRecord[]; skipped: number }> {
    if (scope === 'one' || !current.seriesId) return { rows: [current], skipped: 0 };
    const series = await this.prisma.shiftAssignment.findMany({
      where: {
        seriesId: current.seriesId,
        ...(scope === 'following' && { startsAt: { gte: current.startsAt } }),
      },
      select: assignmentSelect,
      orderBy: { startsAt: 'asc' },
    });
    const now = new Date();
    const rows = series.filter((row) => row.startsAt > now);
    return { rows, skipped: series.length - rows.length };
  }

  private async findByIds(ids: string[]): Promise<ShiftAssignment[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: { id: { in: ids } },
      select: assignmentSelect,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(this.toAssignment);
  }

  /** "2026-10-12 to 2026-10-16" for audit summaries; rows are in start order. */
  private dateSpan(rows: AssignmentRecord[]): string {
    const first = rows[0];
    const last = rows.at(-1);
    if (!first || !last) return '';
    return `${zonedDate(first.startsAt, this.timeZone)} to ${zonedDate(last.startsAt, this.timeZone)}`;
  }

  /**
   * Friendly check before the database's exclusion constraint: names the
   * clashing shift. `excludeIds` are the shifts being changed themselves.
   */
  private async assertNoOverlap(
    userId: string,
    periods: readonly Period[],
    db: Db,
    excludeIds: readonly string[] = [],
  ): Promise<void> {
    const clash = await db.shiftAssignment.findFirst({
      where: {
        userId,
        ...(excludeIds.length > 0 && { id: { notIn: [...excludeIds] } }),
        OR: periods.map((period) => ({ startsAt: { lt: period.endsAt }, endsAt: { gt: period.startsAt } })),
      },
      select: { startsAt: true, user: { select: { name: true } }, template: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    if (clash) {
      throw new ConflictException(
        `Overlaps ${clash.user.name}’s ${clash.template.name} shift on ${zonedDate(clash.startsAt, this.timeZone)} at ${zonedTime(clash.startsAt, this.timeZone)}`,
      );
    }
  }
}
