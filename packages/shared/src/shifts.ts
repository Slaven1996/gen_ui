import { z } from 'zod';
import {
  csvEnum,
  csvIds,
  itemsSchema,
  nullableText,
  pageParams,
  paginatedSchema,
  sortParam,
  UserRefSchema,
} from './common/query.js';
import { addDays, addMonths, startOfWeek } from './common/zoned-time.js';

export const SHIFT_ROLES = ['OPERATOR', 'SUPERVISOR', 'ON_CALL'] as const;
export const ShiftRoleSchema = z.enum(SHIFT_ROLES);
export type ShiftRole = z.infer<typeof ShiftRoleSchema>;

/** Longest series one request may create. */
export const MAX_SHIFT_OCCURRENCES = 62;
/** Most shifts one "copy a week" request may create. */
export const MAX_COPIED_SHIFTS = 300;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 06:00');
const calendarDate = z.iso.date();
const duration = z.int().min(15).max(24 * 60);
const weekday = z.int().min(0).max(6);

// ─── Coverage ───────────────────────────────────────────────────────────────

/**
 * How many people of a role a shift needs on the weekdays it starts on
 * ("Fri night" starts on Friday). A shift without rules is never short-staffed.
 */
export const ShiftCoverageRuleSchema = z
  .object({
    role: ShiftRoleSchema,
    weekdays: z.array(weekday).min(1).max(7).describe('Days the shift starts on, 0 = Sunday … 6 = Saturday.'),
    headcount: z.int().min(1).max(20),
  })
  .meta({ id: 'ShiftCoverageRule' });
export type ShiftCoverageRule = z.infer<typeof ShiftCoverageRuleSchema>;

const coverageInput = z
  .array(ShiftCoverageRuleSchema)
  .max(12)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    for (const [index, rule] of rules.entries()) {
      for (const day of rule.weekdays) {
        const key = `${rule.role}:${day}`;
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', path: [index, 'weekdays'], message: 'Each role can have one rule per weekday' });
          return;
        }
        seen.add(key);
      }
    }
  })
  .describe('Staffing targets. Empty: the shift runs every day with no target.');

/** Rules in a stable order with sorted weekdays, so equal coverage compares equal. */
export function normalizeCoverage(rules: readonly ShiftCoverageRule[]): ShiftCoverageRule[] {
  return rules
    .map((rule) => ({ role: rule.role, weekdays: [...new Set(rule.weekdays)].sort((a, b) => a - b), headcount: rule.headcount }))
    .sort((a, b) => SHIFT_ROLES.indexOf(a.role) - SHIFT_ROLES.indexOf(b.role) || (a.weekdays[0] ?? 0) - (b.weekdays[0] ?? 0));
}

/** Whether a shift with these rules runs on `weekday`: always, when it has none. */
export function shiftRunsOn(coverage: readonly ShiftCoverageRule[], weekday: number): boolean {
  return coverage.length === 0 || coverage.some((rule) => rule.weekdays.includes(weekday));
}

// ─── Templates ──────────────────────────────────────────────────────────────

export const ShiftTemplateSchema = z
  .object({
    id: z.guid(),
    name: z.string(),
    startTime: timeOfDay.describe('Start time in the plant time zone, HH:mm.'),
    durationMinutes: z.int().describe('Wall-clock length: a 22:00, 8 h shift ends at 06:00 even when the clocks change.'),
    color: z.string(),
    isActive: z.boolean(),
    coverage: z.array(ShiftCoverageRuleSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ShiftTemplate' });
export type ShiftTemplate = z.infer<typeof ShiftTemplateSchema>;

export const ShiftTemplatesSchema = itemsSchema(ShiftTemplateSchema).meta({ id: 'ShiftTemplates' });

const templateFields = {
  name: z.string().trim().min(1, 'Name is required').max(60),
  startTime: timeOfDay,
  durationMinutes: duration,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #3b82f6'),
  isActive: z.boolean(),
  coverage: coverageInput,
};

export const CreateShiftTemplateSchema = z
  .object({
    ...templateFields,
    isActive: templateFields.isActive.default(true),
    coverage: templateFields.coverage.default([]),
  })
  .meta({ id: 'CreateShiftTemplate' });
export type CreateShiftTemplateInput = z.input<typeof CreateShiftTemplateSchema>;
export type CreateShiftTemplateDto = z.output<typeof CreateShiftTemplateSchema>;

export const UpdateShiftTemplateSchema = z
  .object(templateFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .describe('Affects shifts scheduled from now on; existing ones keep their times.')
  .meta({ id: 'UpdateShiftTemplate' });
export type UpdateShiftTemplateDto = z.output<typeof UpdateShiftTemplateSchema>;

// ─── Assignments ────────────────────────────────────────────────────────────

/** A scheduled person; deactivated people keep their shifts but no longer count. */
export const ShiftPersonSchema = UserRefSchema.extend({ isActive: z.boolean() }).meta({ id: 'ShiftPerson' });

export const ShiftAssignmentSchema = z
  .object({
    id: z.guid(),
    seriesId: z.guid().nullable().describe('Shared by the shifts one repeat or copy created; null for a one-off.'),
    template: ShiftTemplateSchema.pick({ id: true, name: true, color: true, startTime: true, durationMinutes: true }),
    user: ShiftPersonSchema,
    role: ShiftRoleSchema,
    date: calendarDate.describe('The day the shift starts on, in the plant time zone.'),
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
  seriesId: z.guid().optional().describe('Only the shifts of this series.'),
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
    date: calendarDate.describe('First (or only) day the shift starts on, YYYY-MM-DD, in the plant time zone.'),
    startTime: timeOfDay.optional().describe('Custom start, HH:mm. Defaults to the template’s.'),
    durationMinutes: duration.optional().describe('Custom length in minutes. Defaults to the template’s.'),
    notes: nullableText(500).default(null),
    repeat: z
      .object({
        until: calendarDate.describe('Last day to consider, inclusive.'),
        weekdays: z.array(weekday).min(1).max(7).describe('0 = Sunday … 6 = Saturday.'),
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

/** Which shifts of a series a change or removal applies to. */
export const SHIFT_SCOPES = ['one', 'following', 'series'] as const;
export type ShiftScope = (typeof SHIFT_SCOPES)[number];

export const ShiftScopeQuerySchema = z.object({
  scope: z
    .enum(SHIFT_SCOPES)
    .default('one')
    .describe(
      '`one`: just this shift. `following`: this and the later shifts of its series. `series`: the whole series. ' +
        'Wider scopes leave shifts that already started alone.',
    ),
});
export type ShiftScopeQuery = z.output<typeof ShiftScopeQuerySchema>;

/** Fields that move a shift in time; only `scope=one` may change them. */
export const SHIFT_TIME_FIELDS = ['templateId', 'date', 'startTime', 'durationMinutes'] as const;

export const UpdateShiftAssignmentSchema = z
  .object({
    userId: z.guid(),
    role: ShiftRoleSchema,
    notes: nullableText(500),
    templateId: z.guid().describe('Another shift; its times apply unless `startTime`/`durationMinutes` are given.'),
    date: calendarDate.describe('Move to this day, keeping the start time.'),
    startTime: timeOfDay,
    durationMinutes: duration,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateShiftAssignment' });
export type UpdateShiftAssignmentInput = z.input<typeof UpdateShiftAssignmentSchema>;
export type UpdateShiftAssignmentDto = z.output<typeof UpdateShiftAssignmentSchema>;

/** What a change to one or more shifts did. */
export const ShiftChangeResultSchema = z
  .object({
    items: z.array(ShiftAssignmentSchema),
    skipped: z.int().describe('Shifts left alone: already started, or their person or shift is no longer active.'),
  })
  .meta({ id: 'ShiftChangeResult' });
export type ShiftChangeResult = z.infer<typeof ShiftChangeResultSchema>;

export const ShiftRemoveResultSchema = z
  .object({
    removed: z.int(),
    skipped: z.int().describe('Shifts of the series that already started and were kept.'),
  })
  .meta({ id: 'ShiftRemoveResult' });
export type ShiftRemoveResult = z.infer<typeof ShiftRemoveResultSchema>;

export const CopyShiftWeekSchema = z
  .object({
    week: calendarDate.describe('Any day of the week to copy (Monday–Sunday, plant time zone).'),
    weeks: z.int().min(1).max(8).describe('How many of the following weeks to fill.'),
    userId: z.array(z.guid()).max(50).optional().describe('Only these people’s shifts.'),
    templateId: z.array(z.guid()).max(50).optional().describe('Only these shifts.'),
  })
  .meta({ id: 'CopyShiftWeek' });
export type CopyShiftWeekInput = z.input<typeof CopyShiftWeekSchema>;
export type CopyShiftWeekDto = z.output<typeof CopyShiftWeekSchema>;

// ─── Calendar ───────────────────────────────────────────────────────────────

export const SHIFT_CALENDAR_VIEWS = ['month', 'week', 'day'] as const;
export type ShiftCalendarView = (typeof SHIFT_CALENDAR_VIEWS)[number];

/** The Shifts page's URL query and `GET /shifts/calendar`'s query, one and the same. */
export const ShiftCalendarQuerySchema = z.object({
  view: z.enum(SHIFT_CALENDAR_VIEWS).default('week').describe('Period to show.'),
  date: calendarDate.optional().describe('Any day of the period, YYYY-MM-DD. Defaults to today in the plant time zone.'),
  userId: shiftAssignmentFilters.userId,
  templateId: shiftAssignmentFilters.templateId,
  role: shiftAssignmentFilters.role,
});
export type ShiftCalendarQueryInput = z.input<typeof ShiftCalendarQuerySchema>;
export type ShiftCalendarQuery = z.output<typeof ShiftCalendarQuerySchema>;

export const ShiftCalendarDaySchema = z
  .object({
    date: calendarDate,
    startsAt: z.iso.datetime().describe('Midnight in the plant time zone.'),
    endsAt: z.iso.datetime().describe('The next midnight; 23 or 25 hours later when the clocks change.'),
  })
  .meta({ id: 'ShiftCalendarDay' });
export type ShiftCalendarDay = z.infer<typeof ShiftCalendarDaySchema>;

export const ShiftCoverageSchema = z
  .object({
    date: calendarDate,
    templateId: z.guid(),
    role: ShiftRoleSchema,
    required: z.int(),
    filled: z.int().describe('Active people of this role on this shift that day.'),
  })
  .meta({ id: 'ShiftCoverage' });
export type ShiftCoverage = z.infer<typeof ShiftCoverageSchema>;

export const ShiftCalendarSchema = z
  .object({
    timeZone: z.string().describe('The plant time zone every date and time here is in.'),
    view: z.enum(SHIFT_CALENDAR_VIEWS),
    date: calendarDate.describe('The requested day, or today.'),
    from: calendarDate.describe('First day shown.'),
    to: calendarDate.describe('Last day shown (inclusive).'),
    days: z.array(ShiftCalendarDaySchema),
    templates: z.array(ShiftTemplateSchema).describe('Active shifts, plus inactive ones scheduled in the period.'),
    items: z
      .array(ShiftAssignmentSchema)
      .describe('Shifts overlapping the period, including the night that started the day before it.'),
    coverage: z.array(ShiftCoverageSchema).describe('Every staffing target in the period and how far it is met.'),
  })
  .meta({ id: 'ShiftCalendar' });
export type ShiftCalendar = z.infer<typeof ShiftCalendarSchema>;

/** First and last day (inclusive) a view shows around `date`; weeks start on Monday. */
export function calendarWindow(view: ShiftCalendarView, date: string): { from: string; to: string } {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') {
    const from = startOfWeek(date);
    return { from, to: addDays(from, 6) };
  }
  const first = `${date.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
}

/** The anchor day one period before (-1) or after (1) `date`. */
export function stepCalendar(view: ShiftCalendarView, date: string, direction: -1 | 1): string {
  if (view === 'day') return addDays(date, direction);
  if (view === 'week') return addDays(date, 7 * direction);
  return addMonths(`${date.slice(0, 7)}-01`, direction);
}

// ─── On duty ────────────────────────────────────────────────────────────────

export const OnDutyQuerySchema = z.object({
  at: z.iso.datetime({ offset: true }).optional().describe('Defaults to now.'),
  role: csvEnum(SHIFT_ROLES),
});
export type OnDutyQueryInput = z.input<typeof OnDutyQuerySchema>;
export type OnDutyQuery = z.output<typeof OnDutyQuerySchema>;

export const OnDutySchema = z
  .object({
    at: z.iso.datetime(),
    timeZone: z.string().describe('The plant time zone.'),
    items: z.array(ShiftAssignmentSchema).describe('Active people on shift at `at`.'),
    next: z.array(ShiftAssignmentSchema).describe('The next shifts to start within 24 hours (one handover).'),
  })
  .meta({ id: 'OnDuty' });
export type OnDuty = z.infer<typeof OnDutySchema>;
