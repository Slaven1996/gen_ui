import { addDays, localPeriod, shiftPeriod } from '@gen-ui/shared';

/**
 * The copies of one shift into each of the `weeks` weeks after it. They keep
 * the local start time and wall-clock length, so a 22:00–06:00 night stays
 * 22:00–06:00 in a week where the clocks change.
 */
export function planCopy(
  source: { startsAt: Date; endsAt: Date },
  weeks: number,
  timeZone: string,
): Array<{ startsAt: Date; endsAt: Date }> {
  const local = localPeriod(source.startsAt, source.endsAt, timeZone);
  return Array.from({ length: weeks }, (_, index) =>
    shiftPeriod(addDays(local.date, 7 * (index + 1)), local.startTime, local.durationMinutes, timeZone),
  );
}
