import { useId, useState, type FormEvent } from 'react';
import {
  CreateDeviceSchema,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
  UpdateDeviceSchema,
  type Device,
  type DevicePrefill,
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

/** `form`, with the values the assistant filled in put over it. */
const withPrefill = (form: FormState, prefill: DevicePrefill = {}): FormState => ({
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

/**
 * The device form: the dialog's header, fields and button. The pages show it
 * in `DeviceFormDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), with `prefill` over the device's values (or the
 * defaults), each changed value hinting what it was. Either way it sits
 * inside a `Dialog`, which its title and description need.
 */
export function DeviceForm({
  device,
  assetId,
  prefill,
  disabled = false,
  onSaved,
}: {
  device?: Device;
  assetId?: string;
  prefill?: DevicePrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (device: Device) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => withPrefill(fromDevice(device, assetId), prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveDevice();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // When editing, a value the assistant changed says what it was.
  const before = device && fromDevice(device);
  const was = (key: keyof FormState, show: (value: string) => string = (value) => value || 'empty') =>
    before && prefill?.[key] !== undefined && withPrefill(before, prefill)[key] !== before[key]
      ? `Was ${show(before[key] ?? '')}`
      : undefined;

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
      // A day, not a moment: midnight UTC, as the seed stores it, so `.slice(0, 10)` reads back the same day in
      // every time zone. (Local midnight east of UTC is the day before in UTC, and each save moved it back a day.)
      installedAt: form.installedAt ? `${form.installedAt}T00:00:00.000Z` : null,
    };
    const parsed = device ? UpdateDeviceSchema.safeParse(values) : CreateDeviceSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate({ id: device?.id, input: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{device ? `Edit ${device.name}` : 'Register a device'}</DialogTitle>
        <DialogDescription>A status change is also written to the logbook.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-name`} label="Name" hint={was('name')} error={errors.name}>
          <Input id={`${id}-name`} value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field id={`${id}-serial`} label="Serial number" hint={was('serialNumber')} error={errors.serialNumber}>
          <Input id={`${id}-serial`} value={form.serialNumber} onChange={(event) => set('serialNumber', event.target.value)} />
        </Field>
      </div>
      <Field
        id={`${id}-asset`}
        label="Installed on"
        hint={was('assetId', () => device?.asset.name ?? '')}
        error={errors.assetId && 'Choose an asset'}
      >
        <AssetSelect id={`${id}-asset`} value={form.assetId} onChange={(value) => set('assetId', value)} allLabel={null} className="w-full" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-status`} label="Status" hint={was('status', (value) => DEVICE_STATUS[value as DeviceStatus].label)}>
          <Select value={form.status} onValueChange={(value) => set('status', value as DeviceStatus)}>
            <SelectTrigger id={`${id}-status`} className="w-full">
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
        <Field id={`${id}-protocol`} label="Protocol" hint={was('protocol', (value) => DEVICE_PROTOCOL[value as DeviceProtocol])}>
          <Select value={form.protocol} onValueChange={(value) => set('protocol', value as DeviceProtocol)}>
            <SelectTrigger id={`${id}-protocol`} className="w-full">
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
        <Field id={`${id}-model`} label="Model" hint={was('model')} error={errors.model}>
          <Input id={`${id}-model`} value={form.model} onChange={(event) => set('model', event.target.value)} />
        </Field>
        <Field id={`${id}-manufacturer`} label="Manufacturer" hint={was('manufacturer')} error={errors.manufacturer}>
          <Input id={`${id}-manufacturer`} value={form.manufacturer} onChange={(event) => set('manufacturer', event.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field id={`${id}-ip`} label="IP address" hint={was('ipAddress')} error={errors.ipAddress && 'Not a valid IP'}>
          <Input id={`${id}-ip`} value={form.ipAddress} onChange={(event) => set('ipAddress', event.target.value)} />
        </Field>
        <Field id={`${id}-firmware`} label="Firmware" hint={was('firmwareVersion')} error={errors.firmwareVersion}>
          <Input id={`${id}-firmware`} value={form.firmwareVersion} onChange={(event) => set('firmwareVersion', event.target.value)} />
        </Field>
        <Field id={`${id}-installed`} label="Installed" hint={was('installedAt')}>
          <Input id={`${id}-installed`} type="date" value={form.installedAt} onChange={(event) => set('installedAt', event.target.value)} />
        </Field>
      </div>
      {save.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(save.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || save.isPending}>
          {save.isPending ? 'Saving…' : device ? 'Save' : 'Register device'}
        </Button>
      </DialogFooter>
    </form>
  );
}
