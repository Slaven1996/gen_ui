import { coverageOverlap } from '@gen-ui/shared';

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

describe('coverageOverlap', () => {
  it('finds nothing in no rules', () => {
    expect(coverageOverlap([])).toBeNull();
  });

  it('allows one role on separate days in separate rules', () => {
    expect(
      coverageOverlap([
        { role: 'OPERATOR', weekdays: WEEKDAYS },
        { role: 'OPERATOR', weekdays: WEEKEND },
      ]),
    ).toBeNull();
  });

  it('allows different roles on the same day', () => {
    expect(
      coverageOverlap([
        { role: 'OPERATOR', weekdays: WEEKDAYS },
        { role: 'SUPERVISOR', weekdays: WEEKDAYS },
      ]),
    ).toBeNull();
  });

  it('names the first role and weekday two rules share, and the later rule', () => {
    expect(
      coverageOverlap([
        { role: 'SUPERVISOR', weekdays: WEEKDAYS },
        { role: 'OPERATOR', weekdays: WEEKEND },
        { role: 'OPERATOR', weekdays: [5, 6] },
      ]),
    ).toEqual({ index: 2, role: 'OPERATOR', weekday: 6 });
  });

  it('counts a weekday listed twice in one rule', () => {
    expect(coverageOverlap([{ role: 'ON_CALL', weekdays: [0, 0] }])).toEqual({ index: 0, role: 'ON_CALL', weekday: 0 });
  });
});
