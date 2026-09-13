import { describe, expect, it } from "vitest";
import { DiscountKind } from "@prisma/client";
import { EXAMPLE_LIST_CENTS, describeRate, quoteFor, tierDiscountCents, type TierRate } from "./pricing-tiers-math";

function tier(overrides: Partial<TierRate>): TierRate {
  return {
    id: "t1",
    name: "Legacy",
    discountKind: DiscountKind.PERCENT,
    discountPercent: null,
    discountCents: null,
    note: null,
    isActive: true,
    ...overrides,
  };
}

describe("tierDiscountCents", () => {
  it("takes a percent off the list total", () => {
    expect(tierDiscountCents(10000, tier({ discountPercent: 15 }))).toBe(1500);
  });

  it("takes a fixed amount off the list total", () => {
    expect(tierDiscountCents(10000, tier({ discountKind: DiscountKind.AMOUNT, discountCents: 1000 }))).toBe(1000);
  });

  it("never discounts past zero", () => {
    expect(tierDiscountCents(500, tier({ discountKind: DiscountKind.AMOUNT, discountCents: 1000 }))).toBe(500);
  });

  it("clamps a percent above 100 to the full total", () => {
    expect(tierDiscountCents(10000, tier({ discountPercent: 150 }))).toBe(10000);
  });

  it("discounts nothing for an inactive tier", () => {
    expect(tierDiscountCents(10000, tier({ discountPercent: 15, isActive: false }))).toBe(0);
  });

  it("discounts nothing when there is no tier", () => {
    expect(tierDiscountCents(10000, null)).toBe(0);
  });

  it("discounts nothing for a zero or negative rate", () => {
    expect(tierDiscountCents(10000, tier({ discountPercent: 0 }))).toBe(0);
    expect(tierDiscountCents(10000, tier({ discountKind: DiscountKind.AMOUNT, discountCents: 0 }))).toBe(0);
  });
});

describe("quoteFor", () => {
  it("reports the list price, the discount and what's quoted", () => {
    const quote = quoteFor(EXAMPLE_LIST_CENTS, tier({ discountPercent: 20 }));
    expect(quote).toEqual({
      listCents: EXAMPLE_LIST_CENTS,
      discountCents: 1700,
      quotedCents: 6800,
      tier: quote.tier,
    });
  });

  it("quotes the list price when there is no tier", () => {
    const quote = quoteFor(EXAMPLE_LIST_CENTS, null);
    expect(quote.quotedCents).toBe(EXAMPLE_LIST_CENTS);
    expect(quote.discountCents).toBe(0);
  });
});

describe("describeRate", () => {
  it("describes a percent rate in the shop's own words", () => {
    expect(describeRate(tier({ discountPercent: 15 }))).toBe("15% off");
  });

  it("describes a fixed-amount rate", () => {
    expect(describeRate(tier({ discountKind: DiscountKind.AMOUNT, discountCents: 1000 }))).toBe("$10 off");
  });

  it("says there is no discount for a zero rate", () => {
    expect(describeRate(tier({ discountPercent: 0 }))).toBe("No discount");
  });
});
