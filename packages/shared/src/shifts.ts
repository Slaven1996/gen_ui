import { z } from 'zod';
import {
  csvEnum,
  csvIds,
  itemsSchema,
  nullableText,
  pageParams,
  paginatedSchema,
  sortParam,
  timeZoneParam,
  UserRefSchema,
} from './common/query.js';

export const SHIFT_ROLES = ['OPERATOR', 'SUPERVISOR', 'ON_CALL'] as const;
export const ShiftRoleSchema = z.enum(SHIFT_ROLES);
export type ShiftRole = z.infer<typeof ShiftRoleSchema>;

/** Longest series one request may create. */
export const MAX_SHIFT_OCCURRENCES = 62;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 06:00');
const calendarDate = z.iso.date();

// ─── Templates ──────────────────────────────────────────────────────────────

export const ShiftTemplateSchema = z
  .object({
    id: z.guid(),
    name: z.string(),
    startTime: timeOfDay.describe('Local start time, HH:mm.'),
    durationMinutes: z.int(),
    color: z.string(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ShiftTemplate' });
export type ShiftTemplate = z.infer<typeof ShiftTemplateSchema>;

export const ShiftTemplatesSchema = itemsSchema(ShiftTemplateSchema).meta({ id: 'ShiftTemplates' });

const templateFields = {
  name: z.string().trim().min(1, 'Name is required').max(60),
  startTime: timeOfDay,
  durationMinutes: z.int().min(15).max(24 * 60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #3b82f6'),
  isActive: z.boolean(),
};

export const CreateShiftTemplateSchema = z
  .object({ ...templateFields, isActive: templateFields.isActive.default(true) })
  .meta({ id: 'CreateShiftTemplate' });
export type CreateShiftTemplateInput = z.input<typeof CreateShiftTemplateSchema>;
export type CreateShiftTemplateDto = z.output<typeof CreateShiftTemplateSchema>;

export const UpdateShiftTemplateSchema = z
  .object(templateFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .describe('Changing times affects future assignments only; existing ones keep their start and end.')
  .meta({ id: 'UpdateShiftTemplate' });
export type UpdateShiftTemplateDto = z.output<typeof UpdateShiftTemplateSchema>;

// ─── Assignments ────────────────────────────────────────────────────────────

export const ShiftAssignmentSchema = z
  .object({
    id: z.guid(),
    template: ShiftTemplateSchema.pick({ id: true, name: true, color: true, startTime: true, durationMinutes: true }),
    user: UserRefSchema,
    role: ShiftRoleSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    notes: z.string().nullable(),
    createdBy: UserRefSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ShiftAssignment' });
export type ShiftAssignment = z.infer<typeof ShiftAssignmentSchema>;

export const shiftAssignmentFilters = {
  from: z.iso.datetime({ offset: true }).optional().describe('Assignments that end after this instant.'),
  to: z.iso.datetime({ offset: true }).optional().describe('Assignments that start before this instant.'),
  userId: csvIds('Only these people.'),
  templateId: csvIds('Only these shifts.'),
  role: csvEnum(SHIFT_ROLES),
};

export const ListShiftAssignmentsQuerySchema = z.object({
  ...pageParams(200, 500),
  sort: sortParam(['startsAt'], 'startsAt'),
  ...shiftAssignmentFilters,
});
export type ListShiftAssignmentsQueryInput = z.input<typeof ListShiftAssignmentsQuerySchema>;
export type ListShiftAssignmentsQuery = z.output<typeof ListShiftAssignmentsQuerySchema>;

export const PaginatedShiftAssignmentsSchema = paginatedSchema(ShiftAssignmentSchema).meta({
  id: 'PaginatedShiftAssignments',
});

export const CreateShiftAssignmentSchema = z
  .object({
    templateId: z.guid(),
    userId: z.guid(),
    role: ShiftRoleSchema.default('OPERATOR'),
    date: calendarDate.describe('First (or only) day, YYYY-MM-DD, in `timeZone`.'),
    timeZone: timeZoneParam().describe('The zone the template’s start time is read in.'),
    notes: nullableText(500).default(null),
    repeat: z
      .object({
        until: calendarDate.describe('Last day to consider, inclusive.'),
        weekdays: z
          .array(z.int().min(0).max(6))
          .min(1)
          .max(7)
          .describe('0 = Sunday … 6 = Saturday.'),
      })
      .optional()
      .describe(`Repeat on these weekdays up to \`until\`. At most ${MAX_SHIFT_OCCURRENCES} shifts per request.`),
  })
  .refine((value) => !value.repeat || value.repeat.until >= value.date, {
    message: 'The repeat end must be on or after the first day',
    path: ['repeat', 'until'],
  })
  .meta({ id: 'CreateShiftAssignment' });
export type CreateShiftAssignmentInput = z.input<typeof CreateShiftAssignmentSchema>;
export type CreateShiftAssignmentDto = z.output<typeof CreateShiftAssignmentSchema>;

export const CreatedShiftAssignmentsSchema = itemsSchema(ShiftAssignmentSchema).meta({
  id: 'CreatedShiftAssignments',
});

export const UpdateShiftAssignmentSchema = z
  .object({
    userId: z.guid(),
    role: ShiftRoleSchema,
    notes: nullableText(500),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateShiftAssignment' });
export type UpdateShiftAssignmentDto = z.output<typeof UpdateShiftAssignmentSchema>;

export const OnDutyQuerySchema = z.object({
  at: z.iso.datetime({ offset: true }).optional().describe('Defaults to now.'),
  role: csvEnum(SHIFT_ROLES),
});
export type OnDutyQueryInput = z.input<typeof OnDutyQuerySchema>;
export type OnDutyQuery = z.output<typeof OnDutyQuerySchema>;

export const OnDutySchema = z
  .object({ at: z.iso.datetime(), items: z.array(ShiftAssignmentSchema) })
  .meta({ id: 'OnDuty' });
export type OnDuty = z.infer<typeof OnDutySchema>;
