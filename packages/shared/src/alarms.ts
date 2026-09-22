import { z } from 'zod';
import { AssetRefSchema, TagRefSchema } from './assets.js';
import {
  csvEnum,
  csvIds,
  nullableText,
  pageParams,
  paginatedSchema,
  queryBoolean,
  searchParam,
  sortParam,
  timeRangeParams,
  UserRefSchema,
} from './common/query.js';

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Ordered from most to least severe. */
export const ALARM_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export const AlarmSeveritySchema = z.enum(ALARM_SEVERITIES);
export type AlarmSeverity = z.infer<typeof AlarmSeveritySchema>;

/**
 * Two independent facts — is the condition still present, and has someone
 * acknowledged it — give four states (ISA-18.2 style):
 *
 *   ACTIVE        condition present, not acknowledged
 *   ACKNOWLEDGED  condition present, acknowledged
 *   CLEARED       condition gone, not acknowledged yet
 *   CLOSED        condition gone and acknowledged — nothing left to do
 */
export const ALARM_STATES = ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED', 'CLOSED'] as const;
export const AlarmStateSchema = z.enum(ALARM_STATES);
export type AlarmState = z.infer<typeof AlarmStateSchema>;

/** States that still need an operator: the condition is present, or nobody has acknowledged it. */
export const OPEN_ALARM_STATES = ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'] as const satisfies readonly AlarmState[];
export const UNACKNOWLEDGED_ALARM_STATES = ['ACTIVE', 'CLEARED'] as const satisfies readonly AlarmState[];

export const ALARM_CONDITIONS = ['ABOVE', 'BELOW', 'EQUAL', 'NOT_EQUAL'] as const;
export const AlarmConditionSchema = z.enum(ALARM_CONDITIONS);
export type AlarmCondition = z.infer<typeof AlarmConditionSchema>;

// ─── Definitions (rules) ────────────────────────────────────────────────────

export const AlarmDefinitionSchema = z
  .object({
    id: z.guid(),
    tagId: z.guid(),
    tag: TagRefSchema,
    asset: AssetRefSchema,
    name: z.string(),
    description: z.string().nullable(),
    condition: AlarmConditionSchema,
    threshold: z.number(),
    deadband: z
      .number()
      .describe('How far the value must return past the threshold before the alarm clears; stops flapping.'),
    severity: AlarmSeveritySchema,
    isEnabled: z.boolean(),
    openAlarmCount: z.int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'AlarmDefinition' });
export type AlarmDefinition = z.infer<typeof AlarmDefinitionSchema>;

export const ALARM_DEFINITION_SORT_FIELDS = ['name', 'severity', 'createdAt'] as const;

export const alarmDefinitionFilters = {
  search: searchParam('rule name or tag'),
  severity: csvEnum(ALARM_SEVERITIES),
  condition: csvEnum(ALARM_CONDITIONS),
  tagId: z.guid().optional(),
  assetId: z.guid().optional().describe('Rules on tags of this asset or anywhere below it.'),
  isEnabled: queryBoolean().optional(),
};

export const ListAlarmDefinitionsQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(ALARM_DEFINITION_SORT_FIELDS, 'name'),
  ...alarmDefinitionFilters,
});
export type ListAlarmDefinitionsQueryInput = z.input<typeof ListAlarmDefinitionsQuerySchema>;
export type ListAlarmDefinitionsQuery = z.output<typeof ListAlarmDefinitionsQuerySchema>;

export const PaginatedAlarmDefinitionsSchema = paginatedSchema(AlarmDefinitionSchema).meta({
  id: 'PaginatedAlarmDefinitions',
});

const definitionFields = {
  tagId: z.guid(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: nullableText(500),
  condition: AlarmConditionSchema,
  threshold: z.number(),
  deadband: z.number().min(0),
  severity: AlarmSeveritySchema,
  isEnabled: z.boolean(),
};

export const CreateAlarmDefinitionSchema = z
  .object({
    ...definitionFields,
    description: definitionFields.description.default(null),
    deadband: definitionFields.deadband.default(0),
    severity: definitionFields.severity.default('MEDIUM'),
    isEnabled: definitionFields.isEnabled.default(true),
  })
  .meta({ id: 'CreateAlarmDefinition' });
export type CreateAlarmDefinitionInput = z.input<typeof CreateAlarmDefinitionSchema>;
export type CreateAlarmDefinitionDto = z.output<typeof CreateAlarmDefinitionSchema>;

export const UpdateAlarmDefinitionSchema = z
  .object(definitionFields)
  .omit({ tagId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .describe('Changes apply to future evaluations; alarms already raised keep their snapshot.')
  .meta({ id: 'UpdateAlarmDefinition' });
export type UpdateAlarmDefinitionDto = z.output<typeof UpdateAlarmDefinitionSchema>;

// ─── Alarms (occurrences) ───────────────────────────────────────────────────

export const AlarmSchema = z
  .object({
    id: z.guid(),
    definitionId: z.guid(),
    definition: z.object({
      id: z.guid(),
      name: z.string(),
      condition: AlarmConditionSchema,
      threshold: z.number(),
    }),
    tag: TagRefSchema,
    asset: AssetRefSchema,
    severity: AlarmSeveritySchema.describe('Copied from the rule when the alarm was raised.'),
    state: AlarmStateSchema,
    message: z.string(),
    triggerValue: z.number().nullable(),
    clearValue: z.number().nullable(),
    raisedAt: z.iso.datetime(),
    clearedAt: z.iso.datetime().nullable(),
    acknowledgedAt: z.iso.datetime().nullable(),
    acknowledgedBy: UserRefSchema.nullable(),
    acknowledgeNote: z.string().nullable(),
  })
  .meta({ id: 'Alarm' });
export type Alarm = z.infer<typeof AlarmSchema>;

export const ALARM_SORT_FIELDS = ['raisedAt', 'severity', 'state', 'clearedAt', 'acknowledgedAt'] as const;

/** The filters an alarm list understands. Dashboard widgets and the assistant pick from these. */
export const alarmFilters = {
  search: searchParam('the alarm message, rule or tag name'),
  state: csvEnum(ALARM_STATES),
  severity: csvEnum(ALARM_SEVERITIES),
  assetId: z.guid().optional().describe('Alarms on this asset or anywhere below it.'),
  tagId: z.guid().optional(),
  definitionId: csvIds('Only alarms raised by these rules.'),
  acknowledged: queryBoolean().optional(),
  ...timeRangeParams(),
};

export const ListAlarmsQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(ALARM_SORT_FIELDS, '-raisedAt'),
  ...alarmFilters,
});
export type ListAlarmsQueryInput = z.input<typeof ListAlarmsQuerySchema>;
export type ListAlarmsQuery = z.output<typeof ListAlarmsQuerySchema>;

export const PaginatedAlarmsSchema = paginatedSchema(AlarmSchema).meta({ id: 'PaginatedAlarms' });

export const AcknowledgeAlarmSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .meta({ id: 'AcknowledgeAlarm' });
export type AcknowledgeAlarmDto = z.output<typeof AcknowledgeAlarmSchema>;

export const AcknowledgeAlarmsSchema = z
  .object({
    ids: z.array(z.guid()).min(1).max(100),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'AcknowledgeAlarms' });
export type AcknowledgeAlarmsDto = z.output<typeof AcknowledgeAlarmsSchema>;

export const AcknowledgeResultSchema = z
  .object({
    acknowledged: z.int().describe('Alarms that changed state.'),
    skipped: z.int().describe('Already acknowledged, or not found.'),
  })
  .meta({ id: 'AcknowledgeResult' });
export type AcknowledgeResult = z.infer<typeof AcknowledgeResultSchema>;
