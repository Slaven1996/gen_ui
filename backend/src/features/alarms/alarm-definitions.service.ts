import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AlarmDefinition,
  CreateAlarmDefinitionDto,
  ListAlarmDefinitionsQuery,
  Paginated,
  UpdateAlarmDefinitionDto,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, orderBy, pageArgs, toPaginated, withinAsset } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { definitionSelect, toDefinition } from './alarm.mapper.js';

@Injectable()
export class AlarmDefinitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAlarmDefinitionsQuery): Promise<Paginated<AlarmDefinition>> {
    const where: Prisma.AlarmDefinitionWhereInput = {
      ...(query.search && {
        OR: [
          { name: insensitive(query.search) },
          { tag: { name: insensitive(query.search) } },
          { tag: { code: insensitive(query.search) } },
        ],
      }),
      ...(query.severity && { severity: { in: query.severity } }),
      ...(query.condition && { condition: { in: query.condition } }),
      ...(query.tagId && { tagId: query.tagId }),
      ...(query.assetId && { tag: { device: { asset: withinAsset(query.assetId) } } }),
      ...(query.isEnabled !== undefined && { isEnabled: query.isEnabled }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alarmDefinition.findMany({
        where,
        select: definitionSelect,
        orderBy: orderBy(query.sort, {
          name: (direction) => ({ name: direction }),
          severity: (direction) => ({ severity: direction }),
          createdAt: (direction) => ({ createdAt: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.alarmDefinition.count({ where }),
    ]);
    return toPaginated(rows.map(toDefinition), total, query);
  }

  async get(id: string): Promise<AlarmDefinition> {
    const row = await this.prisma.alarmDefinition.findUnique({ where: { id }, select: definitionSelect });
    if (!row) throw new NotFoundException('Alarm rule not found');
    return toDefinition(row);
  }

  async create(dto: CreateAlarmDefinitionDto, actor: AuthUser): Promise<AlarmDefinition> {
    const tag = await this.prisma.tag.findUnique({ where: { id: dto.tagId }, select: { name: true } });
    if (!tag) throw new BadRequestException('Tag not found');

    const row = await this.uow.run(async (tx) => {
      const definition = await tx.alarmDefinition.create({ data: dto, select: definitionSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'alarm_definition.create',
          entityType: 'ALARM_DEFINITION',
          entityId: definition.id,
          summary: `Created alarm rule “${dto.name}” on ${tag.name}`,
          changes: { condition: dto.condition, threshold: dto.threshold, severity: dto.severity },
        },
        tx,
      );
      return definition;
    });
    return toDefinition(row);
  }

  async update(id: string, dto: UpdateAlarmDefinitionDto, actor: AuthUser): Promise<AlarmDefinition> {
    const current = await this.prisma.alarmDefinition.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Alarm rule not found');

    const row = await this.uow.run(async (tx) => {
      const definition = await tx.alarmDefinition.update({ where: { id }, data: dto, select: definitionSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'alarm_definition.update',
          entityType: 'ALARM_DEFINITION',
          entityId: id,
          summary: `Updated alarm rule “${definition.name}”`,
          changes: diff(current, dto),
        },
        tx,
      );
      return definition;
    });
    return toDefinition(row);
  }

  /** A rule that has fired keeps its history; disable it instead. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const definition = await this.prisma.alarmDefinition.findUnique({
      where: { id },
      select: { name: true, _count: { select: { alarms: true } } },
    });
    if (!definition) throw new NotFoundException('Alarm rule not found');
    if (definition._count.alarms > 0) {
      throw new ConflictException('This rule has alarm history. Disable it instead.');
    }

    await this.uow.run(async (tx) => {
      await tx.alarmDefinition.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'alarm_definition.delete',
          entityType: 'ALARM_DEFINITION',
          entityId: id,
          summary: `Deleted alarm rule “${definition.name}”`,
        },
        tx,
      );
    });
  }
}
