import {
  Bell,
  BellDot,
  BellOff,
  BellRing,
  Box,
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  Cog,
  Cpu,
  Info,
  Map as MapIcon,
  MessageSquareText,
  NotebookPen,
  OctagonAlert,
  OctagonX,
  StickyNote,
  TriangleAlert,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  ALARM_CONDITIONS,
  ALARM_SEVERITIES,
  ALARM_STATES,
  ASSET_TYPES,
  AUDIT_ENTITY_TYPES,
  DEVICE_PROTOCOLS,
  DEVICE_STATUSES,
  LOG_SEVERITIES,
  LOGBOOK_CATEGORIES,
  SHIFT_ROLES,
  TAG_DATA_TYPES,
  type AlarmCondition,
  type AlarmSeverity,
  type AlarmState,
  type AssetType,
  type AuditEntityType,
  type DeviceProtocol,
  type DeviceStatus,
  type LogbookCategory,
  type LogSeverity,
  type NotificationType,
  type ShiftCalendarView,
  type ShiftRole,
  type ShiftScope,
  type TagDataType,
} from '@gen-ui/shared';
import type { FilterOption } from '@/components/filters/multi-select-filter';
import type { StatusTone } from '@/components/status-badge';

/** How each domain value is shown: label, icon and (for states) a status tone. */
export interface Presentation {
  label: string;
  icon: LucideIcon;
  tone: StatusTone;
}

export const SEVERITY: Record<AlarmSeverity, Presentation> = {
  CRITICAL: { label: 'Critical', icon: OctagonAlert, tone: 'critical' },
  HIGH: { label: 'High', icon: TriangleAlert, tone: 'serious' },
  MEDIUM: { label: 'Medium', icon: CircleAlert, tone: 'warning' },
  LOW: { label: 'Low', icon: Info, tone: 'info' },
  INFO: { label: 'Info', icon: Info, tone: 'neutral' },
};

export const ALARM_STATE: Record<AlarmState, Presentation> = {
  ACTIVE: { label: 'Active', icon: BellRing, tone: 'critical' },
  ACKNOWLEDGED: { label: 'Acknowledged', icon: BellDot, tone: 'warning' },
  CLEARED: { label: 'Cleared', icon: Bell, tone: 'info' },
  CLOSED: { label: 'Closed', icon: CheckCircle2, tone: 'good' },
};

export const DEVICE_STATUS: Record<DeviceStatus, Presentation> = {
  ONLINE: { label: 'Online', icon: Wifi, tone: 'good' },
  OFFLINE: { label: 'Offline', icon: WifiOff, tone: 'serious' },
  MAINTENANCE: { label: 'Maintenance', icon: Wrench, tone: 'info' },
  FAULT: { label: 'Fault', icon: OctagonX, tone: 'critical' },
};

export const LOG_SEVERITY: Record<LogSeverity, Presentation> = {
  INFO: { label: 'Info', icon: Info, tone: 'neutral' },
  WARNING: { label: 'Warning', icon: TriangleAlert, tone: 'warning' },
  CRITICAL: { label: 'Critical', icon: OctagonAlert, tone: 'critical' },
};

export const LOGBOOK_CATEGORY: Record<LogbookCategory, { label: string; icon: LucideIcon }> = {
  NOTE: { label: 'Note', icon: StickyNote },
  ALARM: { label: 'Alarm', icon: Bell },
  DEVICE: { label: 'Device', icon: Cpu },
  MAINTENANCE: { label: 'Maintenance', icon: Wrench },
  SHIFT: { label: 'Shift handover', icon: Users },
};

/** What a notification is about, shown above its title in the bell. */
export const NOTIFICATION_TYPE: Record<NotificationType, { label: string; icon: LucideIcon }> = {
  ALARM_RAISED: { label: 'Alarm', icon: BellRing },
  ALARM_ACKNOWLEDGED: { label: 'Acknowledged', icon: CheckCheck },
  ALARM_CLEARED: { label: 'Cleared by hand', icon: BellOff },
  ALARM_NOTE: { label: 'Note on alarm', icon: MessageSquareText },
  LOGBOOK_ENTRY: { label: 'Logbook', icon: NotebookPen },
  SHIFT_SCHEDULED: { label: 'Shift scheduled', icon: CalendarPlus },
  SHIFT_CHANGED: { label: 'Shift changed', icon: CalendarClock },
  SHIFT_REMOVED: { label: 'Shift removed', icon: CalendarX },
};

export const ASSET_TYPE: Record<AssetType, { label: string; icon: LucideIcon }> = {
  REGION: { label: 'Region', icon: MapIcon },
  SITE: { label: 'Site', icon: Building2 },
  AREA: { label: 'Area', icon: Box },
  EQUIPMENT: { label: 'Equipment', icon: Cog },
};

export const DEVICE_PROTOCOL: Record<DeviceProtocol, string> = {
  MODBUS_TCP: 'Modbus TCP',
  OPC_UA: 'OPC UA',
  MQTT: 'MQTT',
  IEC_104: 'IEC 60870-5-104',
  DNP3: 'DNP3',
  OTHER: 'Other',
};

export const TAG_DATA_TYPE: Record<TagDataType, string> = {
  ANALOG: 'Analog',
  DIGITAL: 'Digital',
  COUNTER: 'Counter',
};

export const ALARM_CONDITION: Record<AlarmCondition, { label: string; symbol: string }> = {
  ABOVE: { label: 'Above', symbol: '>' },
  BELOW: { label: 'Below', symbol: '<' },
  EQUAL: { label: 'Equal to', symbol: '=' },
  NOT_EQUAL: { label: 'Not equal to', symbol: '≠' },
};

export const SHIFT_ROLE: Record<ShiftRole, string> = {
  OPERATOR: 'Operator',
  SUPERVISOR: 'Supervisor',
  ON_CALL: 'On call',
};

/** Which shifts of a series a change or removal applies to. */
export const SHIFT_SCOPE: Record<ShiftScope, string> = {
  one: 'This shift',
  following: 'This and the following ones',
  series: 'The whole series',
};

export const CALENDAR_VIEW: Record<ShiftCalendarView, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
};

/** Monday first, as the calendars show them; values are JavaScript's (0 = Sunday). */
export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;

export const AUDIT_ENTITY: Record<AuditEntityType, string> = {
  ASSET: 'Asset',
  DEVICE: 'Device',
  TAG: 'Tag',
  ALARM_DEFINITION: 'Alarm rule',
  ALARM: 'Alarm',
  LOGBOOK_ENTRY: 'Logbook entry',
  SHIFT_TEMPLATE: 'Shift template',
  SHIFT_ASSIGNMENT: 'Shift assignment',
  DASHBOARD: 'Dashboard',
  USER: 'User',
};

// ─── Filter options, in the API's order ─────────────────────────────────────

const options = <T extends string>(values: readonly T[], label: (value: T) => string): FilterOption<T>[] =>
  values.map((value) => ({ value, label: label(value) }));

export const SEVERITY_OPTIONS = options(ALARM_SEVERITIES, (value) => SEVERITY[value].label);
export const ALARM_STATE_OPTIONS = options(ALARM_STATES, (value) => ALARM_STATE[value].label);
export const DEVICE_STATUS_OPTIONS = options(DEVICE_STATUSES, (value) => DEVICE_STATUS[value].label);
export const DEVICE_PROTOCOL_OPTIONS = options(DEVICE_PROTOCOLS, (value) => DEVICE_PROTOCOL[value]);
export const LOG_SEVERITY_OPTIONS = options(LOG_SEVERITIES, (value) => LOG_SEVERITY[value].label);
export const LOGBOOK_CATEGORY_OPTIONS = options(LOGBOOK_CATEGORIES, (value) => LOGBOOK_CATEGORY[value].label);
export const ASSET_TYPE_OPTIONS = options(ASSET_TYPES, (value) => ASSET_TYPE[value].label);
export const TAG_DATA_TYPE_OPTIONS = options(TAG_DATA_TYPES, (value) => TAG_DATA_TYPE[value]);
export const ALARM_CONDITION_OPTIONS = options(ALARM_CONDITIONS, (value) => ALARM_CONDITION[value].label);
export const SHIFT_ROLE_OPTIONS = options(SHIFT_ROLES, (value) => SHIFT_ROLE[value]);
export const AUDIT_ENTITY_OPTIONS = options(AUDIT_ENTITY_TYPES, (value) => AUDIT_ENTITY[value]);
