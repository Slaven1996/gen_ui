import {
  type ShiftAssignment,
  type ShiftCalendar,
  type ShiftCoverage,
  type ShiftSchedulePrefill,
  type ShiftTemplate,
} from '@gen-ui/shared';

/**
 * Formatting and lookups for the shift calendar. Instants are shown in the
 * plant time zone the calendar comes with, not the browser's; plain dates
 * (`YYYY-MM-DD`) are formatted as UTC midnights so no zone can shift them.
 */

export type ShiftPerson = ShiftAssignment['user'];

// ─── Times ──────────────────────────────────────────────────────────────────

/** What every calendar view gets. */
export interface CalendarViewProps {
  calendar: ShiftCalendar;
  model: CalendarModel;
  /** Today in the plant time zone. */
  today: string;
  /** Admins only. */
  actions?: ShiftActions;
  /** Opens a day from its header; without it (a calendar without controls) headers are plain text. */
  onOpenDay?: (date: string) => void;
}

export interface CalendarModel {
  /** Shifts of a template starting on `date`, supervisors and on-call first. */
  shifts: (date: string, templateId: string) => ShiftAssignment[];
  /** Someone's shifts starting on `date`. */
  shiftsOf: (userId: string, date: string) => ShiftAssignment[];
  /** Unmet staffing targets on `date`, for one template or all. */
  shortfalls: (date: string, templateId?: string) => ShiftCoverage[];
  /** Whether a template runs on `date` (it has a target then, or no targets at all). */
  runsOn: (template: ShiftTemplate, date: string) => boolean;
  /** Everyone with a shift starting in the period, by name. */
  people: ShiftPerson[];
  templateById: Map<string, ShiftTemplate>;
}

/** What the schedule form opens with from an unfilled slot: a part of what the assistant can fill in. */
export type SchedulePrefill = Pick<ShiftSchedulePrefill, 'date' | 'templateId' | 'role'>;

export interface ShiftActions {
  schedule: (prefill?: SchedulePrefill) => void;
  edit: (shift: ShiftAssignment) => void;
  remove: (shift: ShiftAssignment) => void;
}
