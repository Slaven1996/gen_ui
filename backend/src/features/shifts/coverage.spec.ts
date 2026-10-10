import type { ShiftCoverage, ShiftRole } from '@gen-ui/shared';
import { computeCoverage, type CoverageShift, type CoverageTemplate } from './coverage.js';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const templates: CoverageTemplate[] = [
  {
    id: 'morning',
    coverage: [
      { role: 'OPERATOR', weekdays: EVERY_DAY, headcount: 1 },
      { role: 'SUPERVISOR', weekdays: [1, 2, 3, 4, 5], headcount: 1 },
    ],
  },
  { id: 'night', coverage: [{ role: 'OPERATOR', weekdays: EVERY_DAY, headcount: 1 }] },
  { id: 'spare', coverage: [] },
];

const shift = (date: string, templateId: string, role: ShiftRole, active = true): CoverageShift => ({
  date,
  templateId,
  role,
  active,
});

const find = (coverage: ShiftCoverage[], date: string, templateId: string, role: ShiftRole) =>
  coverage.find((entry) => entry.date === date && entry.templateId === templateId && entry.role === role);

// 2026-10-09 is a Friday, 2026-10-10 a Saturday.
describe('computeCoverage', () => {
  it('counts a night shift on the day it starts', () => {
    const coverage = computeCoverage(['2026-10-09', '2026-10-10'], templates, [shift('2026-10-09', 'night', 'OPERATOR')]);
    expect(find(coverage, '2026-10-09', 'night', 'OPERATOR')).toMatchObject({ required: 1, filled: 1 });
    expect(find(coverage, '2026-10-10', 'night', 'OPERATOR')).toMatchObject({ required: 1, filled: 0 });
  });

  it('applies rules only on their weekdays', () => {
    const coverage = computeCoverage(['2026-10-09', '2026-10-10'], templates, []);
    expect(find(coverage, '2026-10-09', 'morning', 'SUPERVISOR')).toBeDefined();
    expect(find(coverage, '2026-10-10', 'morning', 'SUPERVISOR')).toBeUndefined();
    expect(coverage.some((entry) => entry.templateId === 'spare')).toBe(false);
  });

  it('does not count deactivated people', () => {
    const coverage = computeCoverage(['2026-10-09'], templates, [shift('2026-10-09', 'morning', 'OPERATOR', false)]);
    expect(find(coverage, '2026-10-09', 'morning', 'OPERATOR')).toMatchObject({ filled: 0 });
  });

  it('keeps only the requested roles', () => {
    const coverage = computeCoverage(['2026-10-09'], templates, [], ['SUPERVISOR']);
    expect(coverage).toEqual([{ date: '2026-10-09', templateId: 'morning', role: 'SUPERVISOR', required: 1, filled: 0 }]);
  });
});
