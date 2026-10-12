import type { ReactNode } from 'react';
import { DetailCard } from '@/components/detail/detail-card';
import { DeviceDetail } from '@/features/devices/components/device-detail';
import type { ToolInput } from '../../types';

/** The device's detail sheet from the Devices page as a card, with the link beside its title. */
export function DeviceDetailBody({ input, action }: { input: ToolInput<'showDevice'>; action?: ReactNode }) {
  return (
    <DetailCard>
      <DeviceDetail deviceId={input.deviceId} action={action} />
    </DetailCard>
  );
}
