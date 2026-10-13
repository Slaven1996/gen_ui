import type { LinkProps } from '@tanstack/react-router';
import type { AppNotification } from '@gen-ui/shared';

/** The logbook's `search` param takes at most this many characters; a longer one would be dropped. */
const SEARCH_MAX = 100;

/**
 * Where a notification's title leads: its alarm (with the alarm's sheet
 * open), the latest acknowledged alarms (several acknowledged at once), the
 * logbook searched for the entry's title (entries have no page of their own)
 * or the calendar at the shift's day. A demo alarm leads nowhere.
 */
export function notificationLink(notification: AppNotification): Pick<LinkProps, 'to' | 'search'> | undefined {
  if (notification.alarmId) return { to: '/alarms', search: { alarm: notification.alarmId } };
  switch (notification.type) {
    case 'ALARM_ACKNOWLEDGED':
      return { to: '/alarms', search: { acknowledged: true, sort: '-acknowledgedAt' } };
    case 'LOGBOOK_ENTRY':
      return { to: '/logbook', search: { search: notification.title.slice(0, SEARCH_MAX) } };
    case 'SHIFT_SCHEDULED':
    case 'SHIFT_CHANGED':
    case 'SHIFT_REMOVED':
      return notification.shiftDate ? { to: '/shifts', search: { date: notification.shiftDate } } : undefined;
    default:
      return undefined;
  }
}
