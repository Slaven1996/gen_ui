import type { AlarmSeverity, AlarmState, DeviceStatus, LogSeverity } from '@gen-ui/shared';
import { ALARM_STATE, DEVICE_STATUS, LOG_SEVERITY, SEVERITY, type Presentation } from '@/lib/labels';
import { StatusBadge } from './status-badge';

const badge = (presentation: Presentation) => (
  <StatusBadge tone={presentation.tone} icon={presentation.icon} label={presentation.label} />
);

export const SeverityBadge = ({ severity }: { severity: AlarmSeverity }) => badge(SEVERITY[severity]);
export const AlarmStateBadge = ({ state }: { state: AlarmState }) => badge(ALARM_STATE[state]);
export const DeviceStatusBadge = ({ status }: { status: DeviceStatus }) => badge(DEVICE_STATUS[status]);
export const LogSeverityBadge = ({ severity }: { severity: LogSeverity }) => badge(LOG_SEVERITY[severity]);
