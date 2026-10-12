import { type Device, type DevicePrefill, type DeviceProtocol, type DeviceStatus } from '@gen-ui/shared';

export interface DeviceFormState {
  assetId: string | undefined;
  name: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  protocol: DeviceProtocol;
  status: DeviceStatus;
  firmwareVersion: string;
  ipAddress: string;
  installedAt: string;
}

export const fromDevice = (device?: Device, assetId?: string): DeviceFormState => ({
  assetId: device?.assetId ?? assetId,
  name: device?.name ?? '',
  serialNumber: device?.serialNumber ?? '',
  model: device?.model ?? '',
  manufacturer: device?.manufacturer ?? '',
  protocol: device?.protocol ?? 'MODBUS_TCP',
  status: device?.status ?? 'OFFLINE',
  firmwareVersion: device?.firmwareVersion ?? '',
  ipAddress: device?.ipAddress ?? '',
  installedAt: device?.installedAt?.slice(0, 10) ?? '',
});

/** `form`, with the values the assistant filled in put over it. */
export const withPrefill = (form: DeviceFormState, prefill: DevicePrefill = {}): DeviceFormState => ({
  ...form,
  assetId: prefill.assetId ?? form.assetId,
  name: prefill.name ?? form.name,
  serialNumber: prefill.serialNumber ?? form.serialNumber,
  model: prefill.model ?? form.model,
  manufacturer: prefill.manufacturer ?? form.manufacturer,
  protocol: prefill.protocol ?? form.protocol,
  status: prefill.status ?? form.status,
  firmwareVersion: prefill.firmwareVersion ?? form.firmwareVersion,
  ipAddress: prefill.ipAddress ?? form.ipAddress,
  installedAt: prefill.installedAt ?? form.installedAt,
});
