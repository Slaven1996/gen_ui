import { getStaticToolName } from 'ai';
import {
  FORM_TITLES,
  templateTimes,
  type AlarmSeverity,
  type AssetType,
  type DeviceProtocol,
  type DeviceStatus,
  type FormToolName,
  type FormToolUIPart,
  type GenUITools,
  type LogbookCategory,
  type LogSeverity,
  type ShiftRole,
  type TagDataType,
} from '@gen-ui/shared';
import { formatDateTime } from '@/lib/format';
import {
  ALARM_CONDITION_OPTIONS,
  ASSET_TYPE,
  DEVICE_PROTOCOL,
  DEVICE_STATUS,
  LOG_SEVERITY,
  LOGBOOK_CATEGORY,
  SEVERITY,
  SHIFT_ROLE,
  TAG_DATA_TYPE,
} from '@/lib/labels';
import { CopyShiftWeekBody } from '../components/form-bodies/copy-shift-week-body';
import { CreateAlarmRuleBody } from '../components/form-bodies/create-alarm-rule-body';
import { CreateAssetBody } from '../components/form-bodies/create-asset-body';
import { CreateDeviceBody } from '../components/form-bodies/create-device-body';
import { CreateLogbookEntryBody } from '../components/form-bodies/create-logbook-entry-body';
import { CreateShiftTemplateBody } from '../components/form-bodies/create-shift-template-body';
import { CreateTagBody } from '../components/form-bodies/create-tag-body';
import { CreateUserBody } from '../components/form-bodies/create-user-body';
import { EditAlarmRuleBody } from '../components/form-bodies/edit-alarm-rule-body';
import { EditAssetBody } from '../components/form-bodies/edit-asset-body';
import { EditDeviceBody } from '../components/form-bodies/edit-device-body';
import { EditLogbookEntryBody } from '../components/form-bodies/edit-logbook-entry-body';
import { EditShiftBody } from '../components/form-bodies/edit-shift-body';
import { EditShiftTemplateBody } from '../components/form-bodies/edit-shift-template-body';
import { EditTagBody } from '../components/form-bodies/edit-tag-body';
import { ScheduleShiftBody } from '../components/form-bodies/schedule-shift-body';
import type { FormRenderer } from '../types';
import { afterEdit, byLabel, describeChanges, savedEdit, shownValue, type ChangeLabels } from './form-changes';

/*
 * Generative UI for forms. A form tool's call is what Claude decided [AI]:
 * which form, pre-filled with what (and for an edit, which record). The view
 * is fixed code [app]: the app's own form, drawn inside the answer by
 * `InlineDialog`, saving through the same REST endpoint as on its page. When
 * the user saves or closes it, the browser records that on the call
 * (PUT /ai/conversations/:id/forms/:toolCallId), and the form gives way to
 * a one-line result, also after a reload.
 */

const RULE_CHANGES: ChangeLabels = {
  description: { show: null },
  isEnabled: { label: 'enabled' },
  severity: { show: byLabel((value) => SEVERITY[value as AlarmSeverity]?.label) },
  condition: { show: byLabel((value) => ALARM_CONDITION_OPTIONS.find((option) => option.value === value)?.label) },
};

const DEVICE_CHANGES: ChangeLabels = {
  serialNumber: { label: 'serial number' },
  asset: { label: 'installed on' },
  status: { show: byLabel((value) => DEVICE_STATUS[value as DeviceStatus]?.label) },
  protocol: { show: byLabel((value) => DEVICE_PROTOCOL[value as DeviceProtocol]) },
  firmwareVersion: { label: 'firmware' },
  ipAddress: { label: 'IP address' },
  installedAt: { label: 'installed' },
};

const TAG_CHANGES: ChangeLabels = {
  description: { show: null },
  dataType: { label: 'type', show: byLabel((value) => TAG_DATA_TYPE[value as TagDataType]) },
  minValue: { label: 'range minimum' },
  maxValue: { label: 'range maximum' },
  logIntervalSeconds: {
    label: 'log interval',
    show: (value) => (typeof value === 'number' ? `${value} s` : shownValue(value)),
  },
  isActive: { label: 'active' },
};

const ASSET_CHANGES: ChangeLabels = {
  type: { show: byLabel((value) => ASSET_TYPE[value as AssetType]?.label) },
  parent: { show: (value) => (value === null ? 'top level' : shownValue(value)) },
  description: { show: null },
  isActive: { label: 'in service' },
};

const categoryLabel = (category: LogbookCategory) => LOGBOOK_CATEGORY[category].label.toLowerCase();

const ENTRY_CHANGES: ChangeLabels = {
  category: { label: 'type', show: byLabel((value) => LOGBOOK_CATEGORY[value as LogbookCategory]?.label) },
  severity: { show: byLabel((value) => LOG_SEVERITY[value as LogSeverity]?.label) },
  body: { label: 'details', show: null },
  occurredAt: { label: 'time', show: (value) => (typeof value === 'string' ? formatDateTime(value) : shownValue(value)) },
};

const hoursShown = (value: unknown) => (typeof value === 'number' ? `${value} h` : shownValue(value));

const SHIFT_CHANGES: ChangeLabels = {
  role: { show: byLabel((value) => SHIFT_ROLE[value as ShiftRole]) },
  hours: { show: hoursShown },
  notes: { show: null },
};

const TEMPLATE_CHANGES: ChangeLabels = {
  startTime: { label: 'start' },
  durationMinutes: { label: 'length', show: (value) => (typeof value === 'number' ? hoursShown(value / 60) : shownValue(value)) },
  color: { label: 'colour' },
  isActive: { label: 'active' },
  coverage: { label: 'staffing', show: null },
};

const shiftCount = (count: number) => `${count} ${count === 1 ? 'shift' : 'shifts'}`;

/**
 * Form tool name → how its calls render. A new form tool adds one entry,
 * wrapping the form its page's dialog already uses; TypeScript flags a form
 * tool without one.
 */
export const FORM_RENDERERS: { [N in FormToolName]: FormRenderer<N> } = {
  createUser: {
    pending: 'Opening the Add user form…',
    label: FORM_TITLES.createUser,
    Form: CreateUserBody,
    saved: ({ user }) => `Added ${user.name}`,
    link: ({ user }) => ({ to: '/users', search: { search: user.email } }),
  },
  createAlarmRule: {
    pending: 'Opening the New alarm rule form…',
    label: FORM_TITLES.createAlarmRule,
    Form: CreateAlarmRuleBody,
    saved: ({ rule }) => `Created “${rule.name}” on ${rule.tag} (${rule.asset})`,
    link: ({ rule }) => ({ to: '/alarm-rules', search: { search: rule.name } }),
  },
  editAlarmRule: {
    pending: 'Opening the alarm rule…',
    label: FORM_TITLES.editAlarmRule,
    Form: EditAlarmRuleBody,
    saved: ({ changed }, { rule }) => savedEdit(changed, rule.name, RULE_CHANGES),
    link: ({ changed }, { rule }) => ({ to: '/alarm-rules', search: { search: afterEdit(changed, 'name', rule.name) } }),
  },
  createDevice: {
    pending: 'Opening the Register a device form…',
    label: FORM_TITLES.createDevice,
    Form: CreateDeviceBody,
    saved: ({ device }) => `Registered ${device.name} (${device.serialNumber}) on ${device.asset}`,
    link: ({ device }) => ({ to: '/devices', search: { search: device.serialNumber } }),
  },
  editDevice: {
    pending: 'Opening the device…',
    label: FORM_TITLES.editDevice,
    Form: EditDeviceBody,
    saved: ({ changed }, { device }) => savedEdit(changed, device.name, DEVICE_CHANGES),
    link: ({ changed }, { device }) => ({
      to: '/devices',
      search: { search: afterEdit(changed, 'serialNumber', device.serialNumber) },
    }),
  },
  createTag: {
    pending: 'Opening the New tag form…',
    label: FORM_TITLES.createTag,
    Form: CreateTagBody,
    saved: ({ tag }) => `Added ${tag.name} (${tag.code}) on ${tag.device}`,
    link: ({ tag }) => ({ to: '/tags', search: { search: tag.code } }),
  },
  editTag: {
    pending: 'Opening the tag…',
    label: FORM_TITLES.editTag,
    Form: EditTagBody,
    saved: ({ changed }, { tag }) => savedEdit(changed, tag.name, TAG_CHANGES),
    link: ({ changed }, { tag }) => ({ to: '/tags', search: { search: afterEdit(changed, 'code', tag.code) } }),
  },
  createAsset: {
    pending: 'Opening the New asset form…',
    label: FORM_TITLES.createAsset,
    Form: CreateAssetBody,
    saved: ({ asset }) =>
      `Added ${asset.name} (${asset.code}) ${asset.parent ? `under ${asset.parent}` : 'at the top of the tree'}`,
    link: ({ asset }) => ({ to: '/assets', search: { search: asset.code } }),
  },
  editAsset: {
    pending: 'Opening the asset…',
    label: FORM_TITLES.editAsset,
    Form: EditAssetBody,
    saved: ({ changed }, { asset }) => savedEdit(changed, asset.name, ASSET_CHANGES),
    link: ({ changed }, { asset }) => ({ to: '/assets', search: { search: afterEdit(changed, 'code', asset.code) } }),
  },
  createLogbookEntry: {
    pending: 'Opening the logbook form…',
    label: FORM_TITLES.createLogbookEntry,
    Form: CreateLogbookEntryBody,
    saved: ({ entry }) =>
      `Wrote ${categoryLabel(entry.category)} “${entry.title}”${entry.asset ? ` on ${entry.asset}` : ''}`,
    link: ({ entry }) => ({ to: '/logbook', search: { search: entry.title } }),
  },
  editLogbookEntry: {
    pending: 'Opening the entry…',
    label: FORM_TITLES.editLogbookEntry,
    Form: EditLogbookEntryBody,
    saved: ({ changed }, { entry }) => savedEdit(changed, entry.title, ENTRY_CHANGES, 'title'),
    link: ({ changed }, { entry }) => ({ to: '/logbook', search: { search: afterEdit(changed, 'title', entry.title) } }),
  },
  scheduleShift: {
    pending: 'Opening the schedule form…',
    label: FORM_TITLES.scheduleShift,
    Form: ScheduleShiftBody,
    saved: ({ scheduled }) =>
      scheduled.shifts === 1
        ? `Scheduled ${scheduled.person} on ${scheduled.shift}, ${scheduled.from}`
        : `Scheduled ${scheduled.person} on ${scheduled.shift}: ${shiftCount(scheduled.shifts)}, ${scheduled.from} to ${scheduled.to}`,
    link: ({ scheduled }) => ({ to: '/shifts', search: { date: scheduled.from } }),
  },
  editShift: {
    pending: 'Opening the shift…',
    label: FORM_TITLES.editShift,
    Form: EditShiftBody,
    saved: ({ changed, shifts }, { shift }) => {
      const which = `${shift.person}’s ${shift.shift} shift on ${shift.date}`;
      if (shifts === 0) return `Saved nothing: the shifts it applied to had already started`;
      const many = shifts > 1 ? ` (${shiftCount(shifts)})` : '';
      return changed
        ? `Saved ${which}${many}: ${describeChanges(changed, SHIFT_CHANGES)}`
        : `Saved ${which} without changes`;
    },
    link: ({ changed }, { shift }) => ({ to: '/shifts', search: { date: afterEdit(changed, 'date', shift.date) } }),
  },
  copyShiftWeek: {
    pending: 'Opening the Copy a week form…',
    label: FORM_TITLES.copyShiftWeek,
    Form: CopyShiftWeekBody,
    saved: ({ copied }) => `Copied ${shiftCount(copied.shifts)}, ${copied.from} to ${copied.to}`,
    link: ({ copied }) => ({ to: '/shifts', search: { date: copied.from } }),
  },
  createShiftTemplate: {
    pending: 'Opening the New shift template form…',
    label: FORM_TITLES.createShiftTemplate,
    Form: CreateShiftTemplateBody,
    saved: ({ template }) => `Added the shift “${template.name}”, ${templateTimes(template).label}`,
    link: () => ({ to: '/shifts', search: {} }),
  },
  editShiftTemplate: {
    pending: 'Opening the shift template…',
    label: FORM_TITLES.editShiftTemplate,
    Form: EditShiftTemplateBody,
    saved: ({ changed }, { template }) => savedEdit(changed, template.name, TEMPLATE_CHANGES),
    link: () => ({ to: '/shifts', search: {} }),
  },
};

export function formRendererFor(part: FormToolUIPart): FormRenderer<FormToolName> {
  const name = getStaticToolName<Pick<GenUITools, FormToolName>>(part);
  return FORM_RENDERERS[name] as unknown as FormRenderer<FormToolName>;
}

