import type { AlarmState } from '@gen-ui/shared';
import { StatusBadge } from '@/components/status-badge';
import { ALARM_STATE } from '@/lib/labels';

/** An alarm state as colour + icon + text. */
export function AlarmStateBadge({ state }: { state: AlarmState }) {
  const { tone, icon, label } = ALARM_STATE[state];
  return <StatusBadge tone={tone} icon={icon} label={label} />;
}
