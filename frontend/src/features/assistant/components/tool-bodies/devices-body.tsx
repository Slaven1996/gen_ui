import { ListDevicesQuerySchema } from '@gen-ui/shared';
import { DevicesTable } from '@/features/devices/components/devices-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Devices page's own table: the same columns, and edit and delete for admins. */
export function DevicesBody({ input }: { input: ToolInput<'listDevices'> }) {
  return <DevicesTable query={ListDevicesQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}

