/**
 * Wall-clock time in an IANA zone → UTC instant, with nothing but `Intl`.
 * Shift templates say "22:00"; that has to mean 22:00 in the planner's zone on
 * each date, whichever side of a DST change the date falls on. The same goes
 * for "signed in on 3 May": the viewer's 3 May, not UTC's.
 */

/** How far `timeZone` is ahead of UTC at `instant`, in ms. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}

/** `+02:00`: how far `timeZone` is ahead of UTC at `at`, written as ISO 8601 writes offsets. */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  const minutes = Math.round(zoneOffset(at.getTime(), timeZone) / 60_000);
  const abs = Math.abs(minutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `('2026-03-29', '02:30', 'Europe/Zagreb')` → the matching UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // The second pass corrects the guess when the first lands across a DST change.
  const first = wallClock - zoneOffset(wallClock, timeZone);
  return new Date(wallClock - zoneOffset(first, timeZone));
}

/** The calendar date `days` after `date` (YYYY-MM-DD). */
function addDays(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

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

/** Calendar dates from `start` to `end` inclusive (YYYY-MM-DD), keeping those on `weekdays` (0 = Sunday). */
export function datesBetween(start: string, end: string, weekdays?: number[]): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    if (!weekdays || weekdays.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
