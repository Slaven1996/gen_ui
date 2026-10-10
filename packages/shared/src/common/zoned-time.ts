/**
 * Calendar dates and wall-clock times in an IANA zone, with nothing but `Intl`.
 * Shift templates say "22:00"; that has to mean 22:00 in the plant's zone on
 * each date, whichever side of a DST change the date falls on. The same goes
 * for "signed in on 3 May": the viewer's 3 May, not UTC's.
 *
 * Plain dates are `YYYY-MM-DD` strings and their arithmetic is zone-free;
 * only the conversions to and from instants take a zone.
 */

const MINUTES_PER_DAY = 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone: building them is the slow part of `Intl`. */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock in `timeZone` shows at `instant`. */
function wallClock(instant: number, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour') % 24,
    minute: part('minute'),
    second: part('second'),
  };
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms. */
function zoneOffset(instant: number, timeZone: string): number {
  const clock = wallClock(instant, timeZone);
  const wallClockAsUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}

const pad = (value: number) => String(value).padStart(2, '0');

function parseDate(date: string): [year: number, month: number, day: number] {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return [year, month, day];
}

/** `HH:mm` → minutes after midnight. */
export function minutesOfDay(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** Minutes after midnight → `HH:mm` (wraps past midnight). */
export function timeOfDay(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** Whether `Intl` knows `value` as a time zone, e.g. `Europe/Zagreb`. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `+02:00`: how far `timeZone` is ahead of UTC at `at`, written as ISO 8601 writes offsets. */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  const minutes = Math.round(zoneOffset(at.getTime(), timeZone) / 60_000);
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * `('2026-03-29', '02:30', 'Europe/Zagreb')` → the matching UTC instant.
 * A time the clocks skip lands just after the change; a repeated one picks
 * its second occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = parseDate(date);
  const minutes = minutesOfDay(time);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // The second pass corrects the guess when the first lands across a DST change.
  const first = wallClockAsUtc - zoneOffset(wallClockAsUtc, timeZone);
  return new Date(wallClockAsUtc - zoneOffset(first, timeZone));
}

/** The calendar date (YYYY-MM-DD) in `timeZone` at `instant`. */
export function zonedDate(instant: Date | string, timeZone: string): string {
  const clock = wallClock(new Date(instant).getTime(), timeZone);
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

/** The wall-clock time (HH:mm) in `timeZone` at `instant`. */
export function zonedTime(instant: Date | string, timeZone: string): string {
  const clock = wallClock(new Date(instant).getTime(), timeZone);
  return `${pad(clock.hour)}:${pad(clock.minute)}`;
}

// ─── Plain dates ────────────────────────────────────────────────────────────

/** The calendar date `days` after `date` (YYYY-MM-DD). */
export function addDays(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/** The same day `months` later, clamped to that month's length (Jan 31 + 1 → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = parseDate(date);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Monday on or before `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Calendar dates from `start` to `end` inclusive (YYYY-MM-DD), keeping those on `weekdays` (0 = Sunday). */
export function datesBetween(start: string, end: string, weekdays?: readonly number[]): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    if (!weekdays || weekdays.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// ─── Days and periods in a zone ─────────────────────────────────────────────

/**
 * The instants one calendar day covers in `timeZone`: from its midnight
 * (inclusive) to the next day's (exclusive). 23 or 25 hours across a DST change.
 */
export function zonedDay(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(date, '00:00', timeZone),
    end: zonedTimeToUtc(addDays(date, 1), '00:00', timeZone),
  };
}

/**
 * A shift starting at `startTime` on `date` and lasting `durationMinutes` of
 * wall-clock time: "22:00, 8 h" ends at 06:00 even on the night the clocks
 * change, so it runs 7 or 9 real hours and still meets the next shift.
 */
export function shiftPeriod(
  date: string,
  startTime: string,
  durationMinutes: number,
  timeZone: string,
): { startsAt: Date; endsAt: Date } {
  const end = minutesOfDay(startTime) + durationMinutes;
  const startsAt = zonedTimeToUtc(date, startTime, timeZone);
  const endsAt = zonedTimeToUtc(addDays(date, Math.floor(end / MINUTES_PER_DAY)), timeOfDay(end), timeZone);
  // Only a shift that starts and ends inside the same skipped hour gets here.
  return endsAt > startsAt ? { startsAt, endsAt } : { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
}

/** The inverse of `shiftPeriod`: the local date, start time and wall-clock length of a period. */
export function localPeriod(
  startsAt: Date | string,
  endsAt: Date | string,
  timeZone: string,
): { date: string; startTime: string; durationMinutes: number } {
  const date = zonedDate(startsAt, timeZone);
  const startTime = zonedTime(startsAt, timeZone);
  const endDate = zonedDate(endsAt, timeZone);
  const endTime = zonedTime(endsAt, timeZone);
  const durationMinutes = daysBetween(date, endDate) * MINUTES_PER_DAY + minutesOfDay(endTime) - minutesOfDay(startTime);
  return { date, startTime, durationMinutes };
}
