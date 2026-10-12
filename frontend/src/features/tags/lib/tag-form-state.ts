import type { Tag, TagDataType, TagPrefill } from '@gen-ui/shared';

export interface TagFormState {
  deviceId: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  dataType: TagDataType;
  minValue: string;
  maxValue: string;
  logIntervalSeconds: string;
  isActive: boolean;
}

export const fromTag = (tag?: Tag, deviceId?: string): TagFormState => ({
  deviceId: tag?.deviceId ?? deviceId ?? '',
  code: tag?.code ?? '',
  name: tag?.name ?? '',
  description: tag?.description ?? '',
  unit: tag?.unit ?? '',
  dataType: tag?.dataType ?? 'ANALOG',
  minValue: tag?.minValue?.toString() ?? '',
  maxValue: tag?.maxValue?.toString() ?? '',
  logIntervalSeconds: String(tag?.logIntervalSeconds ?? 60),
  isActive: tag?.isActive ?? true,
});

/** `form`, with the values the assistant filled in put over it. */
export const withPrefill = (form: TagFormState, prefill: TagPrefill = {}): TagFormState => ({
  ...form,
  code: prefill.code ?? form.code,
  name: prefill.name ?? form.name,
  description: prefill.description ?? form.description,
  unit: prefill.unit ?? form.unit,
  dataType: prefill.dataType ?? form.dataType,
  minValue: prefill.minValue === undefined ? form.minValue : String(prefill.minValue),
  maxValue: prefill.maxValue === undefined ? form.maxValue : String(prefill.maxValue),
  logIntervalSeconds: prefill.logIntervalSeconds === undefined ? form.logIntervalSeconds : String(prefill.logIntervalSeconds),
  isActive: prefill.isActive ?? form.isActive,
});
