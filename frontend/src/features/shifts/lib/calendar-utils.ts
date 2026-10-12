import {
  localPeriod,
  SHIFT_ROLES,
  shiftRunsOn,
  startOfWeek,
  weekdayOf,
  zonedDate,
  zonedTime,
  type ShiftAssignment,
  type ShiftCalendar,
  type ShiftCalendarView,
  type ShiftCoverage,
  type ShiftCoverageRule,
  type ShiftRole,
} from '@gen-ui/shared';
import { SHIFT_ROLE, WEEKDAYS } from '@/lib/labels';
import type { CalendarModel, ShiftPerson } from '../types';

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** `22:00` in the plant zone: 24-hour, so a time range stays short in every locale. */
export function formatClock(instant: string | number | Date, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    // `hourCycle`, not `hour12: false`, which some browsers render as "24:00".
    format = new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    clockFormats.set(timeZone, format);
  }
  return format.format(new Date(instant));
}

/** `22:00–06:00`, and whether it ends on a later day than it starts. */
export function shiftTimes(shift: Pick<ShiftAssignment, 'date' | 'startsAt' | 'endsAt'>, timeZone: string) {
  return {
    label: `${formatClock(shift.startsAt, timeZone)}–${formatClock(shift.endsAt, timeZone)}`,
    overnight: zonedDate(shift.endsAt, timeZone) > shift.date,
  };
}

/** Whether a shift runs other hours than its template says (custom hours, or the template changed since). */
export function hasOwnHours(shift: ShiftAssignment, timeZone: string): boolean {
  return (
    zonedTime(shift.startsAt, timeZone) !== shift.template.startTime ||
    localPeriod(shift.startsAt, shift.endsAt, timeZone).durationMinutes !== shift.template.durationMinutes
  );
}

/** Real minutes worked: 7 or 9 hours on the nights the clocks change. */
export const shiftMinutes = (shift: Pick<ShiftAssignment, 'startsAt' | 'endsAt'>) =>
  (Date.parse(shift.endsAt) - Date.parse(shift.startsAt)) / 60_000;

// ─── Plain dates ────────────────────────────────────────────────────────────

const plain = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
const weekdayFormat = plain({ weekday: 'short' });
const shortDateFormat = plain({ weekday: 'short', day: 'numeric', month: 'short' });
const monthYearFormat = plain({ month: 'long', year: 'numeric' });
const fullDateFormat = plain({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const rangeFormat = plain({ day: 'numeric', month: 'short', year: 'numeric' });
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatWeekday = (date: string) => weekdayFormat.format(asDate(date));
export const formatShortDate = (date: string) => shortDateFormat.format(asDate(date));
export const dayOfMonth = (date: string) => Number(date.slice(8, 10));
export const formatDateRange = (from: string, to: string) => rangeFormat.formatRange(asDate(from), asDate(to));

/** "5 – 11 Oct 2026", "October 2026", "Saturday, 10 October 2026". */
export function periodTitle(calendar: Pick<ShiftCalendar, 'view' | 'date' | 'from' | 'to'>): string {
  if (calendar.view === 'day') return fullDateFormat.format(asDate(calendar.date));
  if (calendar.view === 'month') return monthYearFormat.format(asDate(calendar.date));
  return formatDateRange(calendar.from, calendar.to);
}

/** Whether two days fall in the same month, week or day, as `view` counts. */
export function samePeriod(view: ShiftCalendarView, a: string, b: string): boolean {
  if (view === 'month') return a.slice(0, 7) === b.slice(0, 7);
  if (view === 'week') return startOfWeek(a) === startOfWeek(b);
  return a === b;
}

// ─── Coverage wording ───────────────────────────────────────────────────────

/** "Mon–Fri", "Sat, Sun", "daily". */
export function describeWeekdays(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'daily';
  const chosen = WEEKDAYS.filter((day) => set.has(day.value));
  const positions = WEEKDAYS.flatMap((day, index) => (set.has(day.value) ? [index] : []));
  const consecutive = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
  if (chosen.length > 2 && consecutive) return `${chosen[0].label}–${chosen[chosen.length - 1].label}`;
  return chosen.map((day) => day.label).join(', ');
}

/** "Operator · Supervisor Mon–Fri": who a template needs, and when if not daily. */
export function coverageSummary(rules: readonly ShiftCoverageRule[]): string {
  return rules
    .map((rule) => {
      const who = rule.headcount > 1 ? `${rule.headcount} × ${SHIFT_ROLE[rule.role]}` : SHIFT_ROLE[rule.role];
      const when = describeWeekdays(rule.weekdays);
      return when === 'daily' ? who : `${who} ${when}`;
    })
    .join(' · ');
}

const ROLE_NOUN: Record<ShiftRole, [one: string, many: string]> = {
  OPERATOR: ['operator', 'operators'],
  SUPERVISOR: ['supervisor', 'supervisors'],
  ON_CALL: ['person on call', 'people on call'],
};

/** "Needs 1 supervisor", "Needs 2 operators". */
export function shortfallLabel(entry: ShiftCoverage): string {
  const missing = entry.required - entry.filled;
  return `Needs ${missing} ${ROLE_NOUN[entry.role][missing === 1 ? 0 : 1]}`;
}

/** People still missing across these entries. */
export const missingCount = (entries: readonly ShiftCoverage[]) =>
  entries.reduce((sum, entry) => sum + entry.required - entry.filled, 0);

// ─── Looks ──────────────────────────────────────────────────────────────────

/** A template's colour faded into whatever is behind it, so it works in light and dark. */
export const tint = (color: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, transparent)`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// ─── Lookups ────────────────────────────────────────────────────────────────

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const roleRank = (role: ShiftRole) => (role === 'OPERATOR' ? SHIFT_ROLES.length : SHIFT_ROLES.indexOf(role));

/**
 * Indexes one calendar response. Shifts are filed under the day they start,
 * so the night that began the evening before the period only shows in the
 * day timeline, which draws everything overlapping its day.
 */
export function buildCalendarModel(calendar: ShiftCalendar): CalendarModel {
  const inPeriod = new Set(calendar.days.map((day) => day.date));
  const byTemplate = new Map<string, ShiftAssignment[]>();
  const byPerson = new Map<string, ShiftAssignment[]>();
  const people = new Map<string, ShiftPerson>();
  for (const item of calendar.items) {
    if (!inPeriod.has(item.date)) continue;
    push(byTemplate, `${item.date}|${item.template.id}`, item);
    push(byPerson, `${item.date}|${item.user.id}`, item);
    people.set(item.user.id, item.user);
  }
  for (const list of byTemplate.values()) {
    list.sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.user.name.localeCompare(b.user.name));
  }

  const short = new Map<string, ShiftCoverage[]>();
  for (const entry of calendar.coverage) {
    if (entry.filled >= entry.required) continue;
    push(short, entry.date, entry);
    push(short, `${entry.date}|${entry.templateId}`, entry);
  }

  return {
    shifts: (date, templateId) => byTemplate.get(`${date}|${templateId}`) ?? [],
    shiftsOf: (userId, date) => byPerson.get(`${date}|${userId}`) ?? [],
    shortfalls: (date, templateId) => short.get(templateId ? `${date}|${templateId}` : date) ?? [],
    runsOn: (template, date) => shiftRunsOn(template.coverage, weekdayOf(date)),
    people: [...people.values()].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    templateById: new Map(calendar.templates.map((template) => [template.id, template])),
  };
}
