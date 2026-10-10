import { weekdayOf, type ShiftCoverage, type ShiftCoverageRule, type ShiftRole } from '@gen-ui/shared';

export interface CoverageTemplate {
  id: string;
  coverage: readonly ShiftCoverageRule[];
}

export interface CoverageShift {
  /** The day the shift starts on, in the plant time zone. */
  date: string;
  templateId: string;
  role: ShiftRole;
  /** Deactivated people keep their shifts but leave the post unfilled. */
  active: boolean;
}

/**
 * Every staffing target that applies on `dates` and how many active people
 * fill it. A shift counts on the day it starts, so Friday's night shift
 * covers Friday's rule. `roles` narrows the targets to those roles.
 */
export function computeCoverage(
  dates: readonly string[],
  templates: readonly CoverageTemplate[],
  shifts: readonly CoverageShift[],
  roles?: readonly ShiftRole[],
): ShiftCoverage[] {
  const filled = new Map<string, number>();
  for (const shift of shifts) {
    if (!shift.active) continue;
    const key = `${shift.date}|${shift.templateId}|${shift.role}`;
    filled.set(key, (filled.get(key) ?? 0) + 1);
  }

  const coverage: ShiftCoverage[] = [];
  for (const date of dates) {
    const weekday = weekdayOf(date);
    for (const template of templates) {
      for (const rule of template.coverage) {
        if (!rule.weekdays.includes(weekday) || (roles && !roles.includes(rule.role))) continue;
        coverage.push({
          date,
          templateId: template.id,
          role: rule.role,
          required: rule.headcount,
          filled: filled.get(`${date}|${template.id}|${rule.role}`) ?? 0,
        });
      }
    }
  }
  return coverage;
}
