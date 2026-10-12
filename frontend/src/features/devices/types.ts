import type { Device } from '@gen-ui/shared';

/** Admin row actions; without them the table is read-only. */
export interface DeviceActions {
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}
