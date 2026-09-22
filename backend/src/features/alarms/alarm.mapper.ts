import type { Alarm, AlarmCondition, AlarmDefinition, AlarmSeverity, LogSeverity } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { assetRefSelect, tagRefSelect } from '../assets/asset.mapper.js';
import { iso, isoOrNull } from '../../common/list-query.js';

export const definitionSelect = {
  id: true,
  tagId: true,
  name: true,
  description: true,
  condition: true,
  threshold: true,
  deadband: true,
  severity: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
  tag: { select: { ...tagRefSelect, device: { select: { asset: { select: assetRefSelect } } } } },
  _count: { select: { alarms: { where: { state: { in: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'] } } } } },
} as const satisfies Prisma.AlarmDefinitionSelect;

export type DefinitionRecord = Prisma.AlarmDefinitionGetPayload<{ select: typeof definitionSelect }>;

export function toDefinition(row: DefinitionRecord): AlarmDefinition {
  const { device, ...tag } = row.tag;
  return {
    id: row.id,
    tagId: row.tagId,
    tag,
    asset: device.asset,
    name: row.name,
    description: row.description,
    condition: row.condition,
    threshold: row.threshold,
    deadband: row.deadband,
    severity: row.severity,
    isEnabled: row.isEnabled,
    openAlarmCount: row._count.alarms,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export const alarmSelect = {
  id: true,
  definitionId: true,
  severity: true,
  state: true,
  message: true,
  triggerValue: true,
  clearValue: true,
  raisedAt: true,
  clearedAt: true,
  acknowledgedAt: true,
  acknowledgeNote: true,
  definition: { select: { id: true, name: true, condition: true, threshold: true } },
  tag: { select: tagRefSelect },
  asset: { select: assetRefSelect },
  acknowledgedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.AlarmSelect;

export type AlarmRecord = Prisma.AlarmGetPayload<{ select: typeof alarmSelect }>;

export function toAlarm(row: AlarmRecord): Alarm {
  return {
    id: row.id,
    definitionId: row.definitionId,
    definition: row.definition,
    tag: row.tag,
    asset: row.asset,
    severity: row.severity,
    state: row.state,
    message: row.message,
    triggerValue: row.triggerValue,
    clearValue: row.clearValue,
    raisedAt: iso(row.raisedAt),
    clearedAt: isoOrNull(row.clearedAt),
    acknowledgedAt: isoOrNull(row.acknowledgedAt),
    acknowledgedBy: row.acknowledgedBy,
    acknowledgeNote: row.acknowledgeNote,
  };
}

/** How loudly an alarm event is written to the logbook. */
export const LOG_SEVERITY_FOR: Record<AlarmSeverity, LogSeverity> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'CRITICAL',
  MEDIUM: 'WARNING',
  LOW: 'WARNING',
  INFO: 'INFO',
};

export const CONDITION_TEXT: Record<AlarmCondition, string> = {
  ABOVE: 'above',
  BELOW: 'below',
  EQUAL: 'equal to',
  NOT_EQUAL: 'not equal to',
};

/** `4.62 m`, `1`, `12.5 °C` — readings as they appear in alarm messages. */
export function formatReading(value: number, unit: string | null): string {
  const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return unit ? `${rounded} ${unit}` : rounded;
}
