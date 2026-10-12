import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { AssetLink } from '@/components/asset-link';
import { DeviceStatusBadge } from '@/components/badges/device-status-badge';
import { DetailHeader } from '@/components/detail/detail-header';
import { DetailLink } from '@/components/detail/detail-link';
import { DetailList } from '@/components/detail/detail-list';
import { DetailLoader } from '@/components/detail/detail-loader';
import { DetailRow } from '@/components/detail/detail-row';
import { Button } from '@/components/ui/button';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { formatDateTime, formatRelative, plural } from '@/lib/format';
import { DEVICE_PROTOCOL } from '@/lib/labels';
import { deviceQueryOptions } from '../api/queries';
import { useDeviceActions } from '../hooks/use-device-actions';

/**
 * One device with everything the table leaves out. The body of the devices
 * table's detail sheet and of the assistant's device card; `action` is the
 * card's "Open in new tab". Admins can edit it here (the same dialog as the
 * row menu); deleting stays in the row menu.
 */
export function DeviceDetail({ deviceId, action }: { deviceId: string; action?: ReactNode }) {
  const device = useQuery({ ...deviceQueryOptions(deviceId), refetchInterval: LIVE_REFRESH_MS });
  const { actions, dialogs } = useDeviceActions(true);

  return (
    <>
      <DetailLoader query={device} title="Device" action={action}>
        {(data) => (
          <>
            <DetailHeader
              title={data.name}
              description={[data.manufacturer, data.model].filter(Boolean).join(' ') || data.serialNumber}
              badges={<DeviceStatusBadge status={data.status} />}
              action={action}
            />

            <div className="space-y-5 px-4 pb-6">
              {actions && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => actions.onEdit(data)}>
                    <Pencil />
                    Edit
                  </Button>
                </div>
              )}

              <DetailList>
                <DetailRow label="Serial number">{data.serialNumber}</DetailRow>
                <DetailRow label="Asset">
                  <AssetLink asset={data.asset} />
                </DetailRow>
                <DetailRow label="Model">{data.model ?? '—'}</DetailRow>
                <DetailRow label="Manufacturer">{data.manufacturer ?? '—'}</DetailRow>
                <DetailRow label="Protocol">{DEVICE_PROTOCOL[data.protocol]}</DetailRow>
                <DetailRow label="IP address">{data.ipAddress ?? '—'}</DetailRow>
                <DetailRow label="Firmware">{data.firmwareVersion ?? '—'}</DetailRow>
                {/* Stored as midnight UTC: the day itself, not a moment to convert to local time. */}
                <DetailRow label="Installed">{data.installedAt?.slice(0, 10) ?? '—'}</DetailRow>
                <DetailRow label="Last reading">
                  {data.lastSeenAt ? (
                    <>
                      {formatDateTime(data.lastSeenAt)}
                      <span className="text-muted-foreground"> · {formatRelative(data.lastSeenAt)}</span>
                    </>
                  ) : (
                    'Never'
                  )}
                </DetailRow>
                <DetailRow label="Tags">
                  {data.tagCount > 0 ? (
                    <DetailLink to="/tags" search={{ deviceId: data.id }}>
                      {plural(data.tagCount, 'tag')}
                    </DetailLink>
                  ) : (
                    'None'
                  )}
                </DetailRow>
                <DetailRow label="Registered">{formatDateTime(data.createdAt)}</DetailRow>
                <DetailRow label="Last changed">{formatDateTime(data.updatedAt)}</DetailRow>
              </DetailList>
            </div>
          </>
        )}
      </DetailLoader>
      {dialogs}
    </>
  );
}
