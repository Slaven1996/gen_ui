import { Injectable } from '@nestjs/common';
import type { AuditEntityType, AuditLog, ListAuditLogsQuery, Paginated } from '@gen-ui/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { insensitive, iso, orderBy, pageArgs, timeWindow, toPaginated } from '../common/list-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/transaction.js';

export interface AuditEntry {
  /** `null` when the system acted on its own. */
  actorId: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, unknown> | null;
}

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  summary: true,
  changes: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const satisfies Prisma.AuditLogSelect;

type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

const toAuditLog = (row: AuditRecord): AuditLog => ({
  id: row.id,
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId,
  summary: row.summary,
  changes: (row.changes as Record<string, unknown> | null) ?? null,
  actor: row.actor,
  createdAt: iso(row.createdAt),
});

/**
 * The append-only trail of who changed what. Services call `record` inside the
 * same transaction as the change itself, so a change is never saved without
 * its audit row (or the other way round).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async recordMany(entries: AuditEntry[], db: Db = this.prisma): Promise<void> {
    if (entries.length === 0) return;
    await db.auditLog.createMany({
      data: entries.map((entry) => ({
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLog>> {
    const window = timeWindow(query);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.search && { summary: insensitive(query.search) }),
      ...(query.action &&
        (query.action.endsWith('.')
          ? { action: { startsWith: query.action } }
          : { action: query.action })),
      ...(query.entityType && { entityType: { in: query.entityType } }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.actorId && { actorId: { in: query.actorId } }),
      ...(window && { createdAt: window }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: auditSelect,
        orderBy: orderBy(query.sort, {
          createdAt: (direction) => ({ createdAt: direction }),
          action: (direction) => ({ action: direction }),
          entityType: (direction) => ({ entityType: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return toPaginated(rows.map(toAuditLog), total, query);
  }
}

/**
 * `{ field: { from, to } }` for the fields of `patch` whose value differs
 * from `before`; `null` when nothing changed. Dates compare by instant.
 */
export function diff(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | null {
  const normalize = (value: unknown) => (value instanceof Date ? value.toISOString() : (value ?? null));
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (next === undefined) continue;
    const from = normalize(before[key]);
    const to = normalize(next);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
