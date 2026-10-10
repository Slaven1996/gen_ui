import {
  addMonths,
  calendarWindow,
  datesBetween,
  isTimeZone,
  localPeriod,
  shiftPeriod,
  startOfWeek,
  stepCalendar,
  weekdayOf,
  zonedDate,
  zonedDay,
  zonedTime,
  zonedTimeToUtc,
} from '@gen-ui/shared';

// Budapest: clocks go forward on 2026-03-29 at 02:00 and back on 2026-10-25 at 03:00.
const TZ = 'Europe/Budapest';
const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

describe('zonedTimeToUtc', () => {
  it('reads a wall-clock time in the zone, summer and winter', () => {
    expect(zonedTimeToUtc('2026-10-10', '06:00', TZ).toISOString()).toBe('2026-10-10T04:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-10', '06:00', TZ).toISOString()).toBe('2026-12-10T05:00:00.000Z');
  });

  it('moves a time the clocks skip to just after the change', () => {
    // 02:30 doesn't exist on 2026-03-29; it lands at 03:30 summer time.
    const instant = zonedTimeToUtc('2026-03-29', '02:30', TZ);
    expect(instant.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(zonedTime(instant, TZ)).toBe('03:30');
  });

  it('picks the second of a repeated time', () => {
    // 02:30 happens twice on 2026-10-25: 00:30Z in summer time, 01:30Z in winter time.
    expect(zonedTimeToUtc('2026-10-25', '02:30', TZ).toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('zonedDay', () => {
  it('is 23 hours when the clocks go forward, 25 when they go back', () => {
    const day = (date: string) => zonedDay(date, TZ);
    expect(hours(day('2026-03-29').start, day('2026-03-29').end)).toBe(23);
    expect(hours(day('2026-10-25').start, day('2026-10-25').end)).toBe(25);
    expect(hours(day('2026-10-10').start, day('2026-10-10').end)).toBe(24);
  });
});

describe('shiftPeriod / localPeriod', () => {
  it('ends a night shift at 06:00 local on the nights the clocks change', () => {
    const back = shiftPeriod('2026-10-24', '22:00', 480, TZ);
    expect(zonedDate(back.endsAt, TZ)).toBe('2026-10-25');
    expect(zonedTime(back.endsAt, TZ)).toBe('06:00');
    expect(hours(back.startsAt, back.endsAt)).toBe(9);

    const forward = shiftPeriod('2026-03-28', '22:00', 480, TZ);
    expect(zonedTime(forward.endsAt, TZ)).toBe('06:00');
    expect(hours(forward.startsAt, forward.endsAt)).toBe(7);
  });

  it('round-trips through localPeriod', () => {
    const night = shiftPeriod('2026-10-24', '22:00', 480, TZ);
    expect(localPeriod(night.startsAt, night.endsAt, TZ)).toEqual({
      date: '2026-10-24',
      startTime: '22:00',
      durationMinutes: 480,
    });
    const morning = shiftPeriod('2026-10-10', '06:00', 480, TZ);
    expect(localPeriod(morning.startsAt, morning.endsAt, TZ)).toEqual({
      date: '2026-10-10',
      startTime: '06:00',
      durationMinutes: 480,
    });
  });
});

describe('plain dates', () => {
  it('adds months without overflowing short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('starts weeks on Monday', () => {
    expect(weekdayOf('2026-10-10')).toBe(6);
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('lists dates on chosen weekdays', () => {
    expect(datesBetween('2026-10-05', '2026-10-11', [0, 6])).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('knows real time zones', () => {
    expect(isTimeZone(TZ)).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('calendarWindow / stepCalendar', () => {
  it('spans Monday to Sunday for a week', () => {
    expect(calendarWindow('week', '2026-10-10')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(calendarWindow('day', '2026-10-10')).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });

  it('covers a month with whole weeks: 4 rows for Feb 2027, 6 for Aug 2026', () => {
    expect(calendarWindow('month', '2027-02-14')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    const august = calendarWindow('month', '2026-08-20');
    expect(august).toEqual({ from: '2026-07-27', to: '2026-09-06' });
    expect(datesBetween(august.from, august.to)).toHaveLength(42);
  });

  it('steps by a whole period', () => {
    expect(stepCalendar('day', '2026-10-31', 1)).toBe('2026-11-01');
    expect(stepCalendar('week', '2026-10-10', -1)).toBe('2026-10-03');
    expect(stepCalendar('month', '2026-01-31', 1)).toBe('2026-02-01');
  });
});
