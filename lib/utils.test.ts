import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWithinWalkInWindow,
  shopDayRange,
  formatShopDate,
  currentShopTime,
} from './utils';

describe('utils', () => {
  describe('timezone handling', () => {
    beforeEach(() => {
      // Mock system time to a fixed UTC time: 
      // August 23, 2026, 12:00:00 UTC = 05:00:00 Phoenix (MST, UTC-7)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 23, 12, 0, 0))); // Month is 0-indexed, 7 = Aug
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('currentShopTime calculates Phoenix time correctly from UTC', () => {
      expect(currentShopTime()).toBe('05:00');
    });

    it('formatShopDate returns date in Phoenix timezone', () => {
      // At 12:00 UTC, Phoenix is 05:00 on the SAME day
      expect(formatShopDate(new Date())).toBe('Aug 23, 2026');
      
      // Let's test a boundary: 2026-08-23 03:00:00 UTC is 2026-08-22 20:00:00 Phoenix
      const boundaryDate = new Date(Date.UTC(2026, 7, 23, 3, 0, 0));
      expect(formatShopDate(boundaryDate)).toBe('Aug 22, 2026');
    });

    it('shopDayRange returns boundaries for Phoenix today', () => {
      const { start, end } = shopDayRange();
      // Phoenix today is Aug 23.
      // Phoenix midnight Aug 23 = 07:00 UTC Aug 23
      expect(start.toISOString()).toBe('2026-08-23T07:00:00.000Z');
      // Phoenix midnight Aug 24 = 07:00 UTC Aug 24
      expect(end.toISOString()).toBe('2026-08-24T07:00:00.000Z');
    });
  });

  describe('isWithinWalkInWindow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set to 19:00 UTC = 12:00 Phoenix
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 23, 19, 0, 0)));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true if inside the window', () => {
      expect(isWithinWalkInWindow('09:00', '15:00')).toBe(true);
    });

    it('returns false if before the window', () => {
      expect(isWithinWalkInWindow('13:00', '15:00')).toBe(false);
    });

    it('returns false if after the window', () => {
      expect(isWithinWalkInWindow('09:00', '11:00')).toBe(false);
    });
    
    it('is exclusive on the end boundary', () => {
      expect(isWithinWalkInWindow('09:00', '12:00')).toBe(false);
    });
  });
});

