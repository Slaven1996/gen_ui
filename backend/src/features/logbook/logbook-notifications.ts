import type { AssetRef, LogSeverity } from '@gen-ui/shared';
import type { AlarmSummary } from '../alarms/alarm-notifications.js';
import { clipText, draft, type NewNotification } from '../notifications/new-notification.js';

/** A person's new entry, as much of it as a notification shows. */
export interface WrittenEntry {
  title: string;
  body: string | null;
  severity: LogSeverity;
  asset: AssetRef | null;
}

/** Entries everyone else hears about; Info ones stay in the logbook. */
const NOTIFIED_SEVERITIES: readonly LogSeverity[] = ['WARNING', 'CRITICAL'];

/**
 * What a new entry tells everyone else: a note on an alarm always (named by
 * the alarm's rule, whatever the note's severity), any other entry only when
 * it is a warning or critical one. Null: nothing to send.
 */
export function newEntryNotification(entry: WrittenEntry, alarm: AlarmSummary | null, author: string): NewNotification | null {
  if (alarm) {
    return draft({
      type: 'ALARM_NOTE',
      severity: alarm.severity,
      title: alarm.rule,
      message: `${author}: ${clipText(entry.body ?? entry.title)}`,
      asset: alarm.asset,
      alarmId: alarm.id,
    });
  }
  if (!NOTIFIED_SEVERITIES.includes(entry.severity)) return null;
  return draft({
    type: 'LOGBOOK_ENTRY',
    entrySeverity: entry.severity,
    title: entry.title,
    message: entry.body ? `${author}: ${clipText(entry.body)}` : `Written by ${author}.`,
    asset: entry.asset,
  });
}
