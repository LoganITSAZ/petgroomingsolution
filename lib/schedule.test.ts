import { describe, it, expect } from 'vitest';
import { formatHours, hoursByStaff, type Shift } from './schedule';

/**
 * The schedule's arithmetic. Overtime is read off scheduled hours before the week
 * is worked, so getting the totals wrong means telling a shop it is fine when
 * it is not — the easiest thing here to get subtly wrong, and the reason these
 * are covered rather than the rendering.
 *
 * Times are built in UTC; SHOP_TIMEZONE is America/Phoenix, which has no DST,
 * so a shift built at 15:00Z lands on the same shop day all year.
 */

const STAFF = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
];

function shift(staffId: string, day: number, startHour: number, endHour: number): Shift {
  return {
    id: `${staffId}-${day}-${startHour}`,
    staffId,
    staffName: staffId === 'a' ? 'Ada' : 'Bo',
    startsAt: new Date(Date.UTC(2026, 7, day, startHour, 0)),
    endsAt: new Date(Date.UTC(2026, 7, day, endHour, 0)),
    note: null,
  };
}

// Mon 3 Aug 2026 through Sun 9 Aug, as instants.
const WEEK_START = new Date(Date.UTC(2026, 7, 3, 7, 0));
const WEEK_END = new Date(Date.UTC(2026, 7, 10, 7, 0));

describe('schedule hours', () => {
  describe('formatHours', () => {
    it('drops the minutes when there are none', () => {
      expect(formatHours(480)).toBe('8h');
      expect(formatHours(0)).toBe('0h');
    });

    it('keeps a part hour', () => {
      expect(formatHours(510)).toBe('8h 30m');
      expect(formatHours(45)).toBe('0h 45m');
    });
  });

  describe('hoursByStaff', () => {
    it('totals a week and counts the days worked', () => {
      const shifts = [
        shift('a', 3, 15, 23), // 8h
        shift('a', 4, 15, 23), // 8h
        shift('a', 5, 15, 20), // 5h
      ];
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.minutes).toBe(21 * 60);
      expect(ada.shifts).toBe(3);
      expect(ada.daysWorked).toBe(3);
      expect(ada.level).toBe('under');
    });

    it('reads over the threshold as overtime', () => {
      const shifts = [3, 4, 5, 6, 7].map((day) => shift('a', day, 14, 23)); // 5 × 9h
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.minutes).toBe(45 * 60);
      expect(ada.level).toBe('overtime');
    });

    it('reads the last four hours before the threshold as approaching', () => {
      const shifts = [3, 4, 5, 6].map((day) => shift('a', day, 14, 23)); // 4 × 9h = 36h
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.minutes).toBe(36 * 60);
      expect(ada.level).toBe('approaching');
    });

    it('is exactly at the threshold, not over it', () => {
      const shifts = [3, 4, 5, 6, 7].map((day) => shift('a', day, 15, 23)); // 5 × 8h = 40h
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.minutes).toBe(40 * 60);
      expect(ada.level).toBe('approaching');
    });

    it('honours a shop that sets its own week', () => {
      const shifts = [3, 4, 5, 6].map((day) => shift('a', day, 15, 23)); // 32h
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 30);

      expect(ada.level).toBe('overtime');
    });

    it('counts only the part of a shift inside the window', () => {
      // Sunday night into Monday morning, before the week starts.
      const straddling: Shift = {
        id: 'edge',
        staffId: 'a',
        staffName: 'Ada',
        startsAt: new Date(Date.UTC(2026, 7, 3, 3, 0)),
        endsAt: new Date(Date.UTC(2026, 7, 3, 11, 0)),
        note: null,
      };
      const [ada] = hoursByStaff([STAFF[0]], [straddling], WEEK_START, WEEK_END, 40);

      expect(ada.minutes).toBe(4 * 60);
    });

    it('gives somebody with no shifts a level of its own', () => {
      const rows = hoursByStaff(STAFF, [shift('a', 3, 15, 23)], WEEK_START, WEEK_END, 40);
      const bo = rows.find((row) => row.staffId === 'b')!;

      expect(bo.minutes).toBe(0);
      expect(bo.level).toBe('none');
      expect(bo.longestRun).toBe(0);
    });

    it('finds the longest run of consecutive days', () => {
      // Mon–Wed, then a day off, then Fri–Sat.
      const shifts = [3, 4, 5, 7, 8].map((day) => shift('a', day, 15, 23));
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.daysWorked).toBe(5);
      expect(ada.longestRun).toBe(3);
    });

    it('counts two shifts on one day as one day worked', () => {
      const shifts = [shift('a', 3, 15, 19), shift('a', 3, 20, 23)];
      const [ada] = hoursByStaff([STAFF[0]], shifts, WEEK_START, WEEK_END, 40);

      expect(ada.shifts).toBe(2);
      expect(ada.daysWorked).toBe(1);
      expect(ada.minutes).toBe(7 * 60);
    });
  });
});
