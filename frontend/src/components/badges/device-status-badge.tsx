import type { DeviceStatus } from '@gen-ui/shared';
import { StatusBadge } from '@/components/status-badge';
import { DEVICE_STATUS } from '@/lib/labels';

/** A device status as colour + icon + text. */
export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { tone, icon, label } = DEVICE_STATUS[status];
  return <StatusBadge tone={tone} icon={icon} label={label} />;
}
