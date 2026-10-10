import {
  normalizeCoverage,
  ShiftCoverageRuleSchema,
  zonedDate,
  type ShiftAssignment,
  type ShiftCoverageRule,
  type ShiftTemplate,
} from '@gen-ui/shared';
import { iso } from '../../common/list-query.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const templateSelect = {
  id: true,
  name: true,
  startTime: true,
  durationMinutes: true,
  color: true,
  isActive: true,
  coverage: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShiftTemplateSelect;

type TemplateRecord = Prisma.ShiftTemplateGetPayload<{ select: typeof templateSelect }>;

const storedCoverage = ShiftCoverageRuleSchema.array().catch([]);

/** Coverage as stored (JSONB, validated on write), in a stable order so it compares cleanly. */
export function readCoverage(value: Prisma.JsonValue): ShiftCoverageRule[] {
  return normalizeCoverage(storedCoverage.parse(value));
}

export const toTemplate = (row: TemplateRecord): ShiftTemplate => ({
  ...row,
  coverage: readCoverage(row.coverage),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export const assignmentSelect = {
  id: true,
  seriesId: true,
  role: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  template: { select: { id: true, name: true, color: true, startTime: true, durationMinutes: true } },
  user: { select: { id: true, name: true, isActive: true } },
  createdBy: { select: { id: true, name: true } },
} as const satisfies Prisma.ShiftAssignmentSelect;

export type AssignmentRecord = Prisma.ShiftAssignmentGetPayload<{ select: typeof assignmentSelect }>;

/** `timeZone` is the plant's: it decides which day a shift belongs to. */
export const toAssignment = (row: AssignmentRecord, timeZone: string): ShiftAssignment => ({
  ...row,
  date: zonedDate(row.startsAt, timeZone),
  startsAt: iso(row.startsAt),
  endsAt: iso(row.endsAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});
