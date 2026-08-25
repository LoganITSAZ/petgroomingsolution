import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWithinWalkInWindow,
  shopDayRange,
  shopDayRangeForKey,
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

  describe('shopDayRangeForKey', () => {
    it('covers the shop day, not the UTC day', () => {
      // The bug this replaces read `2026-08-24` as a UTC day, which in Phoenix
      // opens at 5pm on the 23rd and closes at 5pm on the 24th — the whole
      // evening of the day asked for fell outside it.
      const range = shopDayRangeForKey('2026-08-24');
      expect(range).not.toBeNull();
      expect(range!.start.toISOString()).toBe('2026-08-24T07:00:00.000Z');
      expect(range!.end.toISOString()).toBe('2026-08-25T07:00:00.000Z');
    });

    it('includes a 7pm shop-time appointment on the day it belongs to', () => {
      // 7pm Phoenix on Aug 24 is 02:00 UTC on Aug 25.
      const evening = new Date('2026-08-25T02:00:00.000Z');
      const range = shopDayRangeForKey('2026-08-24')!;
      expect(evening >= range.start && evening < range.end).toBe(true);
    });

    it('agrees with shopDayRange for the current shop day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 23, 12, 0, 0)));
      const today = shopDayRange();
      const byKey = shopDayRangeForKey('2026-08-23')!;
      expect(byKey.start.toISOString()).toBe(today.start.toISOString());
      expect(byKey.end.toISOString()).toBe(today.end.toISOString());
      vi.useRealTimers();
    });

    it('crosses a month boundary', () => {
      const range = shopDayRangeForKey('2026-08-31')!;
      expect(range.end.toISOString()).toBe('2026-09-01T07:00:00.000Z');
    });

    it('rejects malformed and impossible dates', () => {
      expect(shopDayRangeForKey('not-a-date')).toBeNull();
      expect(shopDayRangeForKey('2026-8-24')).toBeNull();
      expect(shopDayRangeForKey('2026-02-31')).toBeNull();
      expect(shopDayRangeForKey('2026-13-01')).toBeNull();
    });

    it('accepts a real leap day and rejects a fake one', () => {
      expect(shopDayRangeForKey('2028-02-29')).not.toBeNull();
      expect(shopDayRangeForKey('2027-02-29')).toBeNull();
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

