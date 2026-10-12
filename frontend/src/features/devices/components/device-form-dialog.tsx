import type { Device } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DeviceForm } from './device-form';

export function DeviceFormDialog({
  open,
  onOpenChange,
  device,
  assetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device?: Device;
  assetId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the device it opens on. */}
        <DeviceForm device={device} assetId={assetId} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
