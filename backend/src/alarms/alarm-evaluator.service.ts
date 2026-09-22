import { Injectable } from '@nestjs/common';
import type { AlarmCondition } from '@gen-ui/shared';
import { LogbookService } from '../logbook/logbook.service.js';
import type { Db } from '../prisma/transaction.js';
import { CONDITION_TEXT, formatReading, LOG_SEVERITY_FOR } from './alarm.mapper.js';

export interface Reading {
  tagId: string;
  value: number;
  ts: Date;
}

export interface EvaluationResult {
  raised: number;
  cleared: number;
}

const EPSILON = 1e-9;

/** Does this value put the rule in alarm? */
function isFiring(condition: AlarmCondition, value: number, threshold: number): boolean {
  switch (condition) {
    case 'ABOVE':
      return value > threshold;
    case 'BELOW':
      return value < threshold;
    case 'EQUAL':
      return Math.abs(value - threshold) < EPSILON;
    case 'NOT_EQUAL':
      return Math.abs(value - threshold) >= EPSILON;
  }
}

/**
 * Has the value returned far enough to clear? The deadband keeps a value that
 * hovers around the threshold from raising and clearing on every reading.
 */
function isClear(condition: AlarmCondition, value: number, threshold: number, deadband: number): boolean {
  switch (condition) {
    case 'ABOVE':
      return value <= threshold - deadband;
    case 'BELOW':
      return value >= threshold + deadband;
    case 'EQUAL':
    case 'NOT_EQUAL':
      return !isFiring(condition, value, threshold);
  }
}

/**
 * Turns readings into alarm state changes. For every enabled rule on the
 * readings' tags: a firing value with no open condition raises an alarm, and
 * a value back inside the deadband clears the one that is open. Each change is
 * also written to the logbook.
 *
 * Runs inside the caller's transaction. The rules are row-locked first, so two
 * concurrent ingests for the same tag cannot both raise an alarm.
 */
@Injectable()
export class AlarmEvaluator {
  constructor(private readonly logbook: LogbookService) {}

  async evaluate(readings: Reading[], db: Db): Promise<EvaluationResult> {
    const result: EvaluationResult = { raised: 0, cleared: 0 };
    const tagIds = [...new Set(readings.map((reading) => reading.tagId))];
    if (tagIds.length === 0) return result;

    const locked = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM alarm_definitions
      WHERE tag_id = ANY(${tagIds}::uuid[]) AND is_enabled
      ORDER BY id
      FOR UPDATE`;
    if (locked.length === 0) return result;

    const definitions = await db.alarmDefinition.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      select: {
        id: true,
        tagId: true,
        name: true,
        condition: true,
        threshold: true,
        deadband: true,
        severity: true,
        tag: { select: { name: true, unit: true, device: { select: { assetId: true } } } },
        // The alarm whose condition is still present, if any (at most one per rule).
        alarms: {
          where: { clearedAt: null },
          select: { id: true, state: true },
          orderBy: { raisedAt: 'desc' },
          take: 1,
        },
      },
    });

    const byTag = new Map<string, typeof definitions>();
    for (const definition of definitions) {
      byTag.set(definition.tagId, [...(byTag.get(definition.tagId) ?? []), definition]);
    }
    const ordered = [...readings].sort((a, b) => a.ts.getTime() - b.ts.getTime());

    for (const reading of ordered) {
      for (const definition of byTag.get(reading.tagId) ?? []) {
        const open = definition.alarms[0];
        const { condition, threshold, deadband, tag } = definition;

        if (!open && isFiring(condition, reading.value, threshold)) {
          const message = `${definition.name}: ${tag.name} ${CONDITION_TEXT[condition]} ${formatReading(threshold, tag.unit)} (${formatReading(reading.value, tag.unit)})`;
          const alarm = await db.alarm.create({
            data: {
              definitionId: definition.id,
              tagId: definition.tagId,
              assetId: tag.device.assetId,
              severity: definition.severity,
              state: 'ACTIVE',
              message,
              triggerValue: reading.value,
              raisedAt: reading.ts,
            },
            select: { id: true, state: true },
          });
          await this.logbook.recordEvent(
            {
              category: 'ALARM',
              severity: LOG_SEVERITY_FOR[definition.severity],
              title: `Alarm raised: ${definition.name}`,
              body: message,
              assetId: tag.device.assetId,
              alarmId: alarm.id,
              occurredAt: reading.ts,
            },
            db,
          );
          definition.alarms = [alarm];
          result.raised++;
        } else if (open && isClear(condition, reading.value, threshold, deadband)) {
          await db.alarm.update({
            where: { id: open.id },
            data: {
              clearedAt: reading.ts,
              clearValue: reading.value,
              state: open.state === 'ACKNOWLEDGED' ? 'CLOSED' : 'CLEARED',
            },
          });
          await this.logbook.recordEvent(
            {
              category: 'ALARM',
              severity: 'INFO',
              title: `Alarm cleared: ${definition.name}`,
              body: `${tag.name} back to ${formatReading(reading.value, tag.unit)}.`,
              assetId: tag.device.assetId,
              alarmId: open.id,
              occurredAt: reading.ts,
            },
            db,
          );
          definition.alarms = [];
          result.cleared++;
        }
      }
    }
    return result;
  }
}
