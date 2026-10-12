import { useQuery } from '@tanstack/react-query';
import { deviceQueryOptions } from '@/features/devices/api/queries';
import { DeviceForm } from '@/features/devices/components/device-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The device as it is now, with Claude's changes over it. */
export function EditDeviceBody({ input, disabled, onSaved }: FormProps<'editDevice'>) {
  const device = useQuery(deviceQueryOptions(input.deviceId));
  return (
    <WhenLoaded query={device}>
      {(current) => (
        <DeviceForm device={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}
