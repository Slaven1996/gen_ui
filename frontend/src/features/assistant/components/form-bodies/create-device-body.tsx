import { DeviceForm } from '@/features/devices/components/device-form';
import type { FormProps } from '../../types';

export function CreateDeviceBody({ input, disabled, onSaved }: FormProps<'createDevice'>) {
  return <DeviceForm prefill={input} disabled={disabled} onSaved={(device) => onSaved(device.id)} />;
}
