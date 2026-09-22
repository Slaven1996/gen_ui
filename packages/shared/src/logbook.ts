import { z } from 'zod';
import { AssetRefSchema } from './assets.js';
import {
  csvEnum,
  csvIds,
  nullableText,
  pageParams,
  paginatedSchema,
  searchParam,
  sortParam,
  timeRangeParams,
  UserRefSchema,
} from './common/query.js';

// ─── Operator logbook ───────────────────────────────────────────────────────

export const LOGBOOK_CATEGORIES = ['NOTE', 'ALARM', 'DEVICE', 'MAINTENANCE', 'SHIFT'] as const;
export const LogbookCategorySchema = z.enum(LOGBOOK_CATEGORIES);
export type LogbookCategory = z.infer<typeof LogbookCategorySchema>;

/** Categories people write. ALARM and DEVICE entries come from the system. */
export const USER_LOGBOOK_CATEGORIES = ['NOTE', 'MAINTENANCE', 'SHIFT'] as const satisfies readonly LogbookCategory[];
export const UserLogbookCategorySchema = z.enum(USER_LOGBOOK_CATEGORIES);

export const LOG_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export const LogSeveritySchema = z.enum(LOG_SEVERITIES);
export type LogSeverity = z.infer<typeof LogSeveritySchema>;

export const LOGBOOK_SOURCES = ['user', 'system'] as const;

export const LogbookEntrySchema = z
  .object({
    id: z.guid(),
    category: LogbookCategorySchema,
    severity: LogSeveritySchema,
    title: z.string(),
    body: z.string().nullable(),
    occurredAt: z.iso.datetime(),
    asset: AssetRefSchema.nullable(),
    alarmId: z.guid().nullable(),
    author: UserRefSchema.nullable().describe('`null` for entries the system wrote.'),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'LogbookEntry' });
export type LogbookEntry = z.infer<typeof LogbookEntrySchema>;

export const LOGBOOK_SORT_FIELDS = ['occurredAt', 'severity', 'category'] as const;

export const logbookFilters = {
  search: searchParam('title or text'),
  category: csvEnum(LOGBOOK_CATEGORIES),
  severity: csvEnum(LOG_SEVERITIES),
  source: z.enum(LOGBOOK_SOURCES).optional().describe('`user`: written by people. `system`: generated events.'),
  assetId: z.guid().optional().describe('Entries on this asset or anywhere below it.'),
  alarmId: z.guid().optional(),
  authorId: csvIds('Entries written by these users.'),
  ...timeRangeParams(),
};

export const ListLogbookQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(LOGBOOK_SORT_FIELDS, '-occurredAt'),
  ...logbookFilters,
});
export type ListLogbookQueryInput = z.input<typeof ListLogbookQuerySchema>;
export type ListLogbookQuery = z.output<typeof ListLogbookQuerySchema>;

export const PaginatedLogbookSchema = paginatedSchema(LogbookEntrySchema).meta({ id: 'PaginatedLogbook' });

const entryFields = {
  category: UserLogbookCategorySchema,
  severity: LogSeveritySchema,
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: nullableText(5000),
  occurredAt: z.iso.datetime({ offset: true }),
  assetId: z.guid().nullable(),
};

export const CreateLogbookEntrySchema = z
  .object({
    ...entryFields,
    category: entryFields.category.default('NOTE'),
    severity: entryFields.severity.default('INFO'),
    body: entryFields.body.default(null),
    occurredAt: entryFields.occurredAt.optional().describe('Defaults to now.'),
    assetId: entryFields.assetId.default(null),
    alarmId: z.guid().nullable().default(null).describe('Attach the note to an alarm’s timeline.'),
  })
  .meta({ id: 'CreateLogbookEntry' });
export type CreateLogbookEntryInput = z.input<typeof CreateLogbookEntrySchema>;
export type CreateLogbookEntryDto = z.output<typeof CreateLogbookEntrySchema>;

export const UpdateLogbookEntrySchema = z
  .object(entryFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateLogbookEntry' });
export type UpdateLogbookEntryDto = z.output<typeof UpdateLogbookEntrySchema>;

// ─── Audit trail ────────────────────────────────────────────────────────────

export const AUDIT_ENTITY_TYPES = [
  'ASSET',
  'DEVICE',
  'TAG',
  'ALARM_DEFINITION',
  'ALARM',
  'LOGBOOK_ENTRY',
  'SHIFT_TEMPLATE',
  'SHIFT_ASSIGNMENT',
  'DASHBOARD',
  'USER',
] as const;
export const AuditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

export const AuditLogSchema = z
  .object({
    id: z.guid(),
    action: z.string().describe('`<entity>.<verb>`, e.g. `alarm.acknowledge`.'),
    entityType: AuditEntityTypeSchema,
    entityId: z.guid().nullable(),
    summary: z.string(),
    changes: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe('For updates `{ field: { from, to } }`; for creates and deletes, the record’s key fields.'),
    actor: UserRefSchema.nullable().describe('`null` when the system acted.'),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AuditLog' });
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AUDIT_SORT_FIELDS = ['createdAt', 'action', 'entityType'] as const;

export const auditFilters = {
  search: searchParam('the summary'),
  action: z.string().trim().max(60).optional().describe('Exact action, or a prefix ending in "." (e.g. `alarm.`).'),
  entityType: csvEnum(AUDIT_ENTITY_TYPES),
  entityId: z.guid().optional(),
  actorId: csvIds('Actions taken by these users.'),
  ...timeRangeParams(),
};

export const ListAuditLogsQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(AUDIT_SORT_FIELDS, '-createdAt'),
  ...auditFilters,
});
export type ListAuditLogsQueryInput = z.input<typeof ListAuditLogsQuerySchema>;
export type ListAuditLogsQuery = z.output<typeof ListAuditLogsQuerySchema>;

export const PaginatedAuditLogsSchema = paginatedSchema(AuditLogSchema).meta({ id: 'PaginatedAuditLogs' });
