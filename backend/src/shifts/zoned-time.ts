/**
 * Wall-clock time in an IANA zone → UTC instant, with nothing but `Intl`.
 * Shift templates say "22:00"; that has to mean 22:00 in the planner's zone on
 * each date, whichever side of a DST change the date falls on.
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

/** `('2026-03-29', '02:30', 'Europe/Zagreb')` → the matching UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // The second pass corrects the guess when the first lands across a DST change.
  const first = wallClock - zoneOffset(wallClock, timeZone);
  return new Date(wallClock - zoneOffset(first, timeZone));
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
