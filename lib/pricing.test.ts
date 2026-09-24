import { describe, it, expect } from 'vitest';
import {
  formatCents,
  parseDollarsToCents,
  tiersFromBase,
  roundToStep,
  quoteLine,
} from './pricing';

describe('pricing logic', () => {
  describe('formatCents', () => {
    it('formats whole dollars correctly', () => {
      expect(formatCents(5000)).toBe('$50');
      expect(formatCents(0)).toBe('$0');
    });

    it('formats cents correctly', () => {
      expect(formatCents(5050)).toBe('$50.50');
      expect(formatCents(5099)).toBe('$50.99');
    });

    it('handles null/undefined', () => {
      expect(formatCents(null)).toBe('—');
      expect(formatCents(undefined)).toBe('—');
    });
  });

  describe('parseDollarsToCents', () => {
    it('parses valid dollar amounts', () => {
      expect(parseDollarsToCents('50')).toBe(5000);
      expect(parseDollarsToCents('50.50')).toBe(5050);
      expect(parseDollarsToCents('$50.50')).toBe(5050);
    });

    it('returns null for invalid inputs', () => {
      expect(parseDollarsToCents('')).toBe(null);
      expect(parseDollarsToCents('abc')).toBe(null);
      expect(parseDollarsToCents('-10')).toBe(null);
    });
  });

  describe('roundToStep', () => {
    it('rounds to the nearest $5 step by default', () => {
      expect(roundToStep(4800)).toBe(5000);
      expect(roundToStep(5200)).toBe(5000);
      expect(roundToStep(5300)).toBe(5500); // 5300/500 = 10.6, rounds to 11 steps
    });
  });

  describe('tiersFromBase', () => {
    it('calculates tiers correctly and rounds them', () => {
      // Each tier is base * multiplier, then snapped to the nearest $5 step.
      const input = {
        basePriceCents: 5000,
        mediumMultiplier: 1.33, // 6650 -> 13.3 steps -> 13 -> 6500
        largeMultiplier: 1.87, //  9350 -> 18.7 steps -> 19 -> 9500
        xlMultiplier: 2.53, //   12650 -> 25.3 steps -> 25 -> 12500
      };

      const result = tiersFromBase(input);
      expect(result).toEqual({
        priceSmallCents: 5000,
        priceMediumCents: 6500,
        priceLargeCents: 9500,
        priceXlCents: 12500,
      });
    });

    it('returns nulls when base is missing', () => {
      const input = {
        basePriceCents: null,
        mediumMultiplier: 1.33,
        largeMultiplier: 1.87,
        xlMultiplier: 2.53,
      };

      const result = tiersFromBase(input);
      expect(result).toEqual({
        priceSmallCents: null,
        priceMediumCents: null,
        priceLargeCents: null,
        priceXlCents: null,
      });
    });
  });
});

describe("quoteLine", () => {
  const sized = {
    priceSmallCents: 4500,
    priceMediumCents: 6000,
    priceLargeCents: null,
    priceXlCents: 10000,
    priceFlatCents: null,
    priceMaxCents: null,
  };
  const flat = {
    priceSmallCents: null,
    priceMediumCents: null,
    priceLargeCents: null,
    priceXlCents: null,
    priceFlatCents: 1500,
    priceMaxCents: null,
  };

  it("prices a size-priced service at the pet's size", () => {
    expect(quoteLine(sized, "MEDIUM")).toEqual({ priceCents: 6000, sizeTier: "MEDIUM" });
    expect(quoteLine(sized, "XL")).toEqual({ priceCents: 10000, sizeTier: "XL" });
  });

  it("falls back to the floor when the size has no price", () => {
    expect(quoteLine(sized, "LARGE")).toEqual({ priceCents: 4500, sizeTier: null });
  });

  it("falls back to the floor when the size is unknown", () => {
    expect(quoteLine(sized, null)).toEqual({ priceCents: 4500, sizeTier: null });
  });

  it("ignores size on a flat service", () => {
    expect(quoteLine(flat, "XL")).toEqual({ priceCents: 1500, sizeTier: null });
  });
});
