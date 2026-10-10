import { localPeriod, shiftPeriod, zonedDate } from '@gen-ui/shared';
import { planCopy } from './copy-plan.js';

const TZ = 'Europe/Budapest';

describe('planCopy', () => {
  it('makes one copy per following week', () => {
    const morning = shiftPeriod('2026-10-06', '06:00', 480, TZ);
    expect(planCopy(morning, 3, TZ).map((copy) => zonedDate(copy.startsAt, TZ))).toEqual([
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
    ]);
  });

  it('keeps local times across the change back to winter time', () => {
    // Saturday night a week before the clocks go back (2026-10-25).
    const night = shiftPeriod('2026-10-17', '22:00', 480, TZ);
    const [copy] = planCopy(night, 1, TZ);
    expect(localPeriod(copy.startsAt, copy.endsAt, TZ)).toEqual({
      date: '2026-10-24',
      startTime: '22:00',
      durationMinutes: 480,
    });
    expect((copy.endsAt.getTime() - copy.startsAt.getTime()) / 3_600_000).toBe(9);
  });
});
