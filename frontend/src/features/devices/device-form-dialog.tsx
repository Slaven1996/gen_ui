import { useEffect, useState, type FormEvent } from 'react';
import {
  CreateDeviceSchema,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
  UpdateDeviceSchema,
  type Device,
  type DeviceProtocol,
  type DeviceStatus,
} from '@gen-ui/shared';
import { blankToNull, Field, fieldErrors } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaveDevice } from '@/features/assets/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { getErrorMessage } from '@/lib/api/errors';
import { DEVICE_PROTOCOL, DEVICE_STATUS } from '@/lib/labels';

interface FormState {
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

const fromDevice = (device?: Device, assetId?: string): FormState => ({
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
  const [form, setForm] = useState(() => fromDevice(device, assetId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveDevice();

  useEffect(() => {
    if (open) {
      setForm(fromDevice(device, assetId));
      setErrors({});
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, device?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      assetId: form.assetId,
      name: form.name,
      serialNumber: form.serialNumber,
      model: blankToNull(form.model),
      manufacturer: blankToNull(form.manufacturer),
      protocol: form.protocol,
      status: form.status,
      firmwareVersion: blankToNull(form.firmwareVersion),
      ipAddress: blankToNull(form.ipAddress),
      installedAt: form.installedAt ? new Date(`${form.installedAt}T00:00:00`).toISOString() : null,
    };
    const parsed = device ? UpdateDeviceSchema.safeParse(values) : CreateDeviceSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: device?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{device ? `Edit ${device.name}` : 'Register a device'}</DialogTitle>
            <DialogDescription>A status change is also written to the logbook.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field id="device-name" label="Name" error={errors.name}>
              <Input id="device-name" value={form.name} onChange={(event) => set('name', event.target.value)} />
            </Field>
            <Field id="device-serial" label="Serial number" error={errors.serialNumber}>
              <Input id="device-serial" value={form.serialNumber} onChange={(event) => set('serialNumber', event.target.value)} />
            </Field>
          </div>
          <Field id="device-asset" label="Installed on" error={errors.assetId && 'Choose an asset'}>
            <AssetSelect id="device-asset" value={form.assetId} onChange={(value) => set('assetId', value)} allLabel={null} className="w-full" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="device-status" label="Status">
              <Select value={form.status} onValueChange={(value) => set('status', value as DeviceStatus)}>
                <SelectTrigger id="device-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {DEVICE_STATUS[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="device-protocol" label="Protocol">
              <Select value={form.protocol} onValueChange={(value) => set('protocol', value as DeviceProtocol)}>
                <SelectTrigger id="device-protocol" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_PROTOCOLS.map((protocol) => (
                    <SelectItem key={protocol} value={protocol}>
                      {DEVICE_PROTOCOL[protocol]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="device-model" label="Model" error={errors.model}>
              <Input id="device-model" value={form.model} onChange={(event) => set('model', event.target.value)} />
            </Field>
            <Field id="device-manufacturer" label="Manufacturer" error={errors.manufacturer}>
              <Input id="device-manufacturer" value={form.manufacturer} onChange={(event) => set('manufacturer', event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field id="device-ip" label="IP address" error={errors.ipAddress && 'Not a valid IP'}>
              <Input id="device-ip" value={form.ipAddress} onChange={(event) => set('ipAddress', event.target.value)} />
            </Field>
            <Field id="device-firmware" label="Firmware" error={errors.firmwareVersion}>
              <Input id="device-firmware" value={form.firmwareVersion} onChange={(event) => set('firmwareVersion', event.target.value)} />
            </Field>
            <Field id="device-installed" label="Installed">
              <Input id="device-installed" type="date" value={form.installedAt} onChange={(event) => set('installedAt', event.target.value)} />
            </Field>
          </div>
          {save.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : device ? 'Save' : 'Register device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
