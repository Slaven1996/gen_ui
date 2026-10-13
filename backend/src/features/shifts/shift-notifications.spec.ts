import { shiftPeriod } from '@gen-ui/shared';
import {
  changedNotices,
  formatPlantDay,
  removedNotices,
  sameOrNull,
  scheduledNotices,
  shiftsLabel,
  type ShiftNoticeContext,
} from './shift-notifications.js';

const TZ = 'Europe/Budapest';
const ADMIN = { id: 'admin', name: 'Marko' };
const ctx: ShiftNoticeContext = { by: ADMIN, timeZone: TZ, now: new Date('2026-10-10T12:00:00Z') };
const night = (date: string) => shiftPeriod(date, '22:00', 480, TZ);
const morning = (date: string) => shiftPeriod(date, '06:00', 480, TZ);

describe('shift labels', () => {
  it('names a plant day', () => {
    expect(formatPlantDay('2026-10-12')).toBe('Mon 12 Oct');
  });

  it('describes one shift across midnight', () => {
    expect(shiftsLabel([night('2026-10-12')], TZ)).toBe('Mon 12 Oct, 22:00–06:00');
  });

  it('describes several, with their hours only when they share them', () => {
    expect(shiftsLabel([night('2026-10-12'), night('2026-10-14')], TZ)).toBe('2 shifts, Mon 12 Oct to Wed 14 Oct, 22:00–06:00');
    expect(shiftsLabel([night('2026-10-12'), morning('2026-10-14')], TZ)).toBe('2 shifts, Mon 12 Oct to Wed 14 Oct');
  });

  it('keeps a value only when all share it', () => {
    expect(sameOrNull(['OPERATOR', 'OPERATOR'])).toBe('OPERATOR');
    expect(sameOrNull(['OPERATOR', 'SUPERVISOR'])).toBeNull();
    expect(sameOrNull([])).toBeNull();
  });
});

describe('shift notices', () => {
  const group = { userId: 'ana', template: 'Night', role: 'OPERATOR' as const };

  it('tells the person about new shifts that are still ahead', () => {
    const [notice, ...rest] = scheduledNotices({ ...group, shifts: [night('2026-10-01'), night('2026-10-12')] }, ctx);
    expect(rest).toEqual([]);
    expect(notice?.userId).toBe('ana');
    expect(notice?.notification).toMatchObject({
      type: 'SHIFT_SCHEDULED',
      title: 'New shift: Night',
      message: 'Mon 12 Oct, 22:00–06:00 as Operator. Scheduled by Marko.',
      shiftDate: '2026-10-12',
      severity: null,
    });
  });

  it('stays quiet about past shifts and about the admin’s own', () => {
    expect(removedNotices({ ...group, shifts: [night('2026-10-01')] }, ctx)).toEqual([]);
    expect(scheduledNotices({ ...group, userId: ADMIN.id, shifts: [night('2026-10-12')] }, ctx)).toEqual([]);
  });

  it('says what changed, and nothing when nothing did', () => {
    const [notice] = changedNotices(
      { ...group, template: 'Morning', shifts: [morning('2026-10-13')] },
      { before: { shift: night('2026-10-12'), template: 'Night' }, role: { to: 'SUPERVISOR', from: 'OPERATOR' } },
      ctx,
    );
    expect(notice?.notification).toMatchObject({
      type: 'SHIFT_CHANGED',
      title: 'Shift changed: Morning',
      message:
        'Tue 13 Oct, 06:00–14:00: moved from Mon 12 Oct, 22:00–06:00 (Night), now Supervisor (was Operator). Changed by Marko.',
      shiftDate: '2026-10-13',
    });
    expect(changedNotices({ ...group, shifts: [night('2026-10-12')] }, {}, ctx)).toEqual([]);
  });

  it('counts a shift moved out of the future into the past', () => {
    const notices = changedNotices(
      { ...group, shifts: [night('2026-10-01')] },
      { before: { shift: night('2026-10-12'), template: 'Night' } },
      ctx,
    );
    expect(notices).toHaveLength(1);
  });
});
