import { zonedDate, zonedTime, type ShiftRole } from '@gen-ui/shared';
import { clipText, draft, type ForUser } from '../notifications/new-notification.js';

/** When one shift runs. */
export interface ShiftSlot {
  startsAt: Date;
  endsAt: Date;
}

/** One person's shifts that a change touched, as their notification names them. */
export interface ShiftGroup {
  userId: string;
  /** The template's name; null when the shifts are on different ones. */
  template: string | null;
  /** Null when the shifts have different roles. */
  role: ShiftRole | null;
  /** In start order. */
  shifts: ShiftSlot[];
}

/** What an edit changed, beyond who has the shifts. */
export interface ShiftChange {
  /** The shift before it moved in time or to another template (only one shift moves at a time). */
  before?: { shift: ShiftSlot; template: string };
  /** `from` is null when the shifts had different roles. */
  role?: { to: ShiftRole; from: ShiftRole | null };
  /** The new notes; null: removed. */
  notes?: string | null;
}

/** Who made the change, the plant zone and the moment that decides which shifts are over. */
export interface ShiftNoticeContext {
  by: { id: string; name: string };
  timeZone: string;
  now: Date;
}

const ROLE: Record<ShiftRole, string> = { OPERATOR: 'Operator', SUPERVISOR: 'Supervisor', ON_CALL: 'On call' };

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Mon 12 Oct" for a plant date (`YYYY-MM-DD`). */
export function formatPlantDay(date: string): string {
  const parts = Object.fromEntries(DAY.formatToParts(new Date(`${date}T00:00:00Z`)).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

const hours = (shift: ShiftSlot, timeZone: string) =>
  `${zonedTime(shift.startsAt, timeZone)}–${zonedTime(shift.endsAt, timeZone)}`;

const day = (shift: ShiftSlot, timeZone: string) => formatPlantDay(zonedDate(shift.startsAt, timeZone));

/**
 * "Mon 12 Oct, 22:00–06:00" for one shift; "8 shifts, Mon 12 Oct to Mon 30
 * Nov, 22:00–06:00" for several (the hours only if they all share them).
 * `shifts` is non-empty and in start order.
 */
export function shiftsLabel(shifts: ShiftSlot[], timeZone: string): string {
  const first = shifts[0]!;
  const last = shifts.at(-1)!;
  if (shifts.length === 1) return `${day(first, timeZone)}, ${hours(first, timeZone)}`;
  const shared = new Set(shifts.map((shift) => hours(shift, timeZone))).size === 1;
  return `${shifts.length} shifts, ${day(first, timeZone)} to ${day(last, timeZone)}${shared ? `, ${hours(first, timeZone)}` : ''}`;
}

/** The one value they all share, or null. */
export function sameOrNull<T>(values: readonly T[]): T | null {
  const [first] = values;
  return first !== undefined && values.every((value) => value === first) ? first : null;
}

/** "New shift: Night", "8 shifts removed: Night", "3 new shifts". */
function heading(group: ShiftGroup, count: number, one: string, several: string): string {
  const template = group.template ? `: ${group.template}` : '';
  return count === 1 ? `${one}${template}` : `${count} ${several}${template}`;
}

/** The person's shifts that aren't over; none when they made the change themselves. */
function upcoming(group: ShiftGroup, ctx: ShiftNoticeContext): ShiftSlot[] {
  if (group.userId === ctx.by.id) return [];
  return group.shifts.filter((shift) => shift.endsAt > ctx.now);
}

/** A notice about `shown` (non-empty), linking to the calendar at its first day. */
function notice(
  group: ShiftGroup,
  shown: ShiftSlot[],
  ctx: ShiftNoticeContext,
  fields: { type: 'SHIFT_SCHEDULED' | 'SHIFT_CHANGED' | 'SHIFT_REMOVED'; title: string; message: string },
): ForUser {
  return {
    userId: group.userId,
    notification: draft({ ...fields, shiftDate: zonedDate(shown[0]!.startsAt, ctx.timeZone) }),
  };
}

/** Tells a person about new shifts of theirs. */
export function scheduledNotices(group: ShiftGroup, ctx: ShiftNoticeContext): ForUser[] {
  const shifts = upcoming(group, ctx);
  if (shifts.length === 0) return [];
  const role = group.role ? ` as ${ROLE[group.role]}` : '';
  return [
    notice(group, shifts, ctx, {
      type: 'SHIFT_SCHEDULED',
      title: heading(group, shifts.length, 'New shift', 'new shifts'),
      message: `${shiftsLabel(shifts, ctx.timeZone)}${role}. Scheduled by ${ctx.by.name}.`,
    }),
  ];
}

/** Tells a person that shifts of theirs are gone (removed, or handed to someone else). */
export function removedNotices(group: ShiftGroup, ctx: ShiftNoticeContext): ForUser[] {
  const shifts = upcoming(group, ctx);
  if (shifts.length === 0) return [];
  return [
    notice(group, shifts, ctx, {
      type: 'SHIFT_REMOVED',
      title: heading(group, shifts.length, 'Shift removed', 'shifts removed'),
      message: `${shiftsLabel(shifts, ctx.timeZone)}. Removed by ${ctx.by.name}.`,
    }),
  ];
}

/**
 * Tells a person what changed on shifts they keep. A shift that moved counts
 * as long as it isn't over either before or after the move.
 */
export function changedNotices(group: ShiftGroup, change: ShiftChange, ctx: ShiftNoticeContext): ForUser[] {
  const { before, role, notes } = change;
  const parts: string[] = [];
  if (before) {
    const template = before.template === group.template ? '' : ` (${before.template})`;
    parts.push(`moved from ${shiftsLabel([before.shift], ctx.timeZone)}${template}`);
  }
  if (role) parts.push(`now ${ROLE[role.to]}${role.from ? ` (was ${ROLE[role.from]})` : ''}`);
  if (notes !== undefined) parts.push(notes ? `notes: “${clipText(notes, 120)}”` : 'notes removed');

  const shifts = upcoming(group, ctx);
  const movedFromUpcoming = before !== undefined && before.shift.endsAt > ctx.now;
  if (parts.length === 0 || group.userId === ctx.by.id || (shifts.length === 0 && !movedFromUpcoming)) return [];
  const shown = shifts.length > 0 ? shifts : group.shifts;
  return [
    notice(group, shown, ctx, {
      type: 'SHIFT_CHANGED',
      title: heading(group, shown.length, 'Shift changed', 'shifts changed'),
      message: `${shiftsLabel(shown, ctx.timeZone)}: ${parts.join(', ')}. Changed by ${ctx.by.name}.`,
    }),
  ];
}
