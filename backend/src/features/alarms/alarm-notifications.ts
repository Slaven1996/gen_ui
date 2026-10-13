import { ALARM_SEVERITIES } from '@gen-ui/shared';
import { clipText, draft, type NewNotification } from '../notifications/new-notification.js';
import type { RaisedAlarm } from './alarm-evaluator.service.js';

/** What a notification about an alarm names: its rule, how bad, where. */
export type AlarmSummary = Pick<RaisedAlarm, 'id' | 'severity' | 'rule' | 'asset'>;

/** A raised alarm as the bell shows it: the rule's name, then what crossed which limit. */
export const raisedNotification = (alarm: RaisedAlarm): NewNotification =>
  draft({
    type: 'ALARM_RAISED',
    severity: alarm.severity,
    title: alarm.rule,
    message: alarm.message,
    asset: alarm.asset,
    alarmId: alarm.id,
  });

/**
 * One notification per acknowledgement, however many alarms it covered: one
 * alarm links to it; several are named (the first two), graded by the worst
 * and placed only if they share an asset.
 */
export function acknowledgedNotification(alarms: AlarmSummary[], by: string, note?: string): NewNotification | null {
  const [first, second] = alarms;
  if (!first) return null;
  const said = note ? `: ${clipText(note)}` : '.';
  if (!second) {
    return draft({
      type: 'ALARM_ACKNOWLEDGED',
      severity: first.severity,
      title: first.rule,
      message: `Acknowledged by ${by}${said}`,
      asset: first.asset,
      alarmId: first.id,
    });
  }

  const rest = alarms.length - 2;
  const names = rest > 0 ? `${first.rule}, ${second.rule} and ${rest} more` : `${first.rule} and ${second.rule}`;
  const sameAsset = alarms.every((alarm) => alarm.asset.id === first.asset.id);
  return draft({
    type: 'ALARM_ACKNOWLEDGED',
    severity: ALARM_SEVERITIES.find((severity) => alarms.some((alarm) => alarm.severity === severity)) ?? first.severity,
    title: `${alarms.length} alarms acknowledged`,
    message: `${names}, by ${by}${said}`,
    asset: sameAsset ? first.asset : null,
  });
}

export const clearedNotification = (alarm: AlarmSummary, by: string): NewNotification =>
  draft({
    type: 'ALARM_CLEARED',
    severity: alarm.severity,
    title: alarm.rule,
    message: `Cleared by hand by ${by}.`,
    asset: alarm.asset,
    alarmId: alarm.id,
  });
