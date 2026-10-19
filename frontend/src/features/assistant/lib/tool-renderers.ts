import { getStaticToolName } from 'ai';
import type { GenUITools } from '@gen-ui/shared';
import { draftLink } from '@/features/dashboards/lib/draft';
import { plural } from '@/lib/format';
import { AlarmDetailBody } from '../components/tool-bodies/alarm-detail-body';
import { AlarmRuleDetailBody } from '../components/tool-bodies/alarm-rule-detail-body';
import { AlarmRulesBody } from '../components/tool-bodies/alarm-rules-body';
import { AlarmsBody } from '../components/tool-bodies/alarms-body';
import { AssetsBody } from '../components/tool-bodies/assets-body';
import { AuditBody } from '../components/tool-bodies/audit-body';
import { DashboardDraftBody } from '../components/tool-bodies/dashboard-draft-body';
import { DeviceDetailBody } from '../components/tool-bodies/device-detail-body';
import { DevicesBody } from '../components/tool-bodies/devices-body';
import { GraphBody } from '../components/tool-bodies/graph-body';
import { LogbookBody } from '../components/tool-bodies/logbook-body';
import { OnDutyBody } from '../components/tool-bodies/on-duty-body';
import { ShiftCalendarBody } from '../components/tool-bodies/shift-calendar-body';
import { TagDetailBody } from '../components/tool-bodies/tag-detail-body';
import { TagsBody } from '../components/tool-bodies/tags-body';
import { UsersBody } from '../components/tool-bodies/users-body';
import type { GenUIToolPart, ListToolName, ToolRenderer } from '../types';
import { withoutTitle } from './tool-queries';

/*
 * Generative UI, the rendering half. A tool part in a message is what Claude
 * decided [AI]: which tool, with which input (e.g. `{ title: 'Admins',
 * role: 'ADMIN' }`). Turning it into a component is fixed code [app]: the
 * registry below maps each tool to a domain view, and that view loads its own
 * data through the REST API, exactly as its page does. The model never
 * produces markup or rows for the screen. Form tools (add, create, edit,
 * schedule, copy) render through their own registry in form-parts.tsx.
 */

/**
 * Tool name → how its calls render. A new tool adds one entry, usually
 * wrapping its domain's existing table (which brings its own role-based row
 * actions); TypeScript flags a tool without one.
 */
export const RENDERERS: { [N in ListToolName]: ToolRenderer<N> } = {
  listUsers: {
    pending: 'Looking up users…',
    title: (input) => input.title,
    link: (input) => ({ to: '/users', search: withoutTitle(input) }),
    Body: UsersBody,
    found: (output) => `${output.total} found`,
  },
  listAlarmRules: {
    pending: 'Looking up alarm rules…',
    title: (input) => input.title,
    link: (input) => ({ to: '/alarm-rules', search: withoutTitle(input) }),
    Body: AlarmRulesBody,
    found: (output) => `${output.total} found`,
  },
  listAuditLogs: {
    pending: 'Searching the audit log…',
    title: (input) => input.title,
    link: (input) => ({ to: '/audit', search: withoutTitle(input) }),
    Body: AuditBody,
    found: (output) => `${output.total} found`,
  },
  listAlarms: {
    pending: 'Looking up alarms…',
    title: (input) => input.title,
    link: (input) => ({ to: '/alarms', search: withoutTitle(input) }),
    Body: AlarmsBody,
    found: (output) => `${output.total} found`,
  },
  listLogbookEntries: {
    pending: 'Searching the logbook…',
    title: (input) => input.title,
    link: (input) => ({ to: '/logbook', search: withoutTitle(input) }),
    Body: LogbookBody,
    found: (output) => `${output.total} found`,
  },
  showShiftCalendar: {
    pending: 'Opening the shift calendar…',
    title: (input) => input.title,
    link: (input) => ({ to: '/shifts', search: withoutTitle(input) }),
    Body: ShiftCalendarBody,
    found: (output) => {
      const missing = output.gaps.reduce((sum, gap) => sum + gap.missing, 0);
      return plural(output.total, 'shift') + (missing > 0 ? ` · ${plural(missing, 'person', 'people')} short` : '');
    },
  },
  showOnDuty: {
    pending: 'Checking who is on duty…',
    title: (input) => (input.when === 'now' ? 'On duty now' : 'Next on duty'),
    link: (input) => ({ to: '/shifts', search: input.role ? { role: input.role } : {} }),
    Body: OnDutyBody,
    framed: false,
    found: (output) => (output.people.length > 0 ? output.people.map((person) => person.name).join(', ') : 'nobody'),
  },
  listDevices: {
    pending: 'Looking up devices…',
    title: (input) => input.title,
    link: (input) => ({ to: '/devices', search: withoutTitle(input) }),
    Body: DevicesBody,
    found: (output) => `${output.total} found`,
  },
  listTags: {
    pending: 'Looking up tags…',
    title: (input) => input.title,
    link: (input) => ({ to: '/tags', search: withoutTitle(input) }),
    Body: TagsBody,
    found: (output) => `${output.total} found`,
  },
  listAssets: {
    pending: 'Looking up assets…',
    title: (input) => input.title,
    link: (input) => ({ to: '/assets', search: withoutTitle(input) }),
    Body: AssetsBody,
    found: (output) => `${output.total} found`,
  },
  plotTags: {
    pending: 'Drawing the chart…',
    title: (input) => input.title,
    link: (input) => ({ to: '/graphs', search: withoutTitle(input) }),
    Body: GraphBody,
    found: (output) => (output.tags.length === 1 ? '1 tag' : `${output.tags.length} tags`),
  },
  // A details card is the page's detail sheet as a card of its own; its link opens the page with that sheet open.
  showAlarm: {
    pending: 'Opening the alarm…',
    title: () => 'Alarm details',
    link: (input) => ({ to: '/alarms', search: { alarm: input.alarmId } }),
    Body: AlarmDetailBody,
    framed: false,
    found: (output) => output.alarm.rule,
  },
  showAlarmRule: {
    pending: 'Opening the alarm rule…',
    title: () => 'Alarm rule details',
    link: (input) => ({ to: '/alarm-rules', search: { rule: input.ruleId } }),
    Body: AlarmRuleDetailBody,
    framed: false,
    found: (output) => output.rule.name,
  },
  showDevice: {
    pending: 'Opening the device…',
    title: () => 'Device details',
    link: (input) => ({ to: '/devices', search: { device: input.deviceId } }),
    Body: DeviceDetailBody,
    framed: false,
    found: (output) => output.device.name,
  },
  showTag: {
    pending: 'Opening the tag…',
    title: () => 'Tag details',
    link: (input) => ({ to: '/tags', search: { tag: input.tagId } }),
    Body: TagDetailBody,
    framed: false,
    found: (output) => output.tag.name,
  },
  // A dashboard draft is a card of its own with the page's grid; its link opens the draft on the Dashboard
  // page (or, once saved, the dashboard), which reads the call from the saved conversation.
  createDashboard: {
    pending: 'Putting the dashboard together…',
    title: (input) => input.name?.trim() || 'New dashboard',
    link: (_input, call) =>
      call.conversationId && call.done
        ? draftLink({ conversationId: call.conversationId, toolCallId: call.toolCallId })
        : { to: '/dashboard', search: {} },
    Body: DashboardDraftBody,
    framed: false,
    found: (output) => {
      const incomplete = output.widgets.filter((widget) => widget.missing.length > 0).length;
      return plural(output.widgets.length, 'widget') + (incomplete > 0 ? ` · ${incomplete} need${incomplete === 1 ? 's' : ''} settings` : '');
    },
  },
};

export function rendererFor(part: GenUIToolPart): ToolRenderer<ListToolName> {
  // TypeScript can't pair a part from the union with its own entry; the tool name does.
  return RENDERERS[getStaticToolName<GenUITools>(part) as ListToolName] as unknown as ToolRenderer<ListToolName>;
}

