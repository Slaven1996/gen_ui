import type { Alarm } from '@gen-ui/shared';

/** Only active and cleared alarms wait for an acknowledgement. */
export const canAcknowledge = (alarm: Alarm) => alarm.state === 'ACTIVE' || alarm.state === 'CLEARED';
