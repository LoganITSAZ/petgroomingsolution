import { describe, it, expect } from "vitest";
import {
  commissionCents,
  effectiveRatePercent,
  payEstimate,
  rateFor,
  type CommissionRates,
} from "@/lib/commission";

const rates: CommissionRates = {
  byService: { "svc-fullgroom": 60 },
  byCategory: { NAILS: 25, GROOM: 50 },
  staffPercent: 45,
  shopPercent: 40,
};

describe("rateFor", () => {
  it("takes the service's own rate over its category", () => {
    expect(rateFor({ serviceId: "svc-fullgroom", category: "GROOM", priceCents: 1 }, rates)).toBe(60);
  });

  it("falls back to the category, then the person, then the shop", () => {
    expect(rateFor({ serviceId: "svc-nails", category: "NAILS", priceCents: 1 }, rates)).toBe(25);
    expect(rateFor({ serviceId: "svc-ears", category: "EARS", priceCents: 1 }, rates)).toBe(45);
    expect(
      rateFor({ serviceId: "svc-ears", category: "EARS", priceCents: 1 }, { shopPercent: 40 })
    ).toBe(40);
  });

  // Zero is a rate the shop chose — an add-on it pays nothing on — and it must
  // not read as "no rate set".
  it("honours a rate of zero rather than falling through it", () => {
    expect(
      rateFor({ serviceId: "svc-x", category: "ADD_ON", priceCents: 1 }, { byCategory: { ADD_ON: 0 }, staffPercent: 45, shopPercent: 40 })
    ).toBe(0);
  });
});

describe("commissionCents", () => {
  it("applies the line's own rate to the line", () => {
    expect(
      commissionCents(
        [
          { serviceId: "svc-fullgroom", category: "GROOM", priceCents: 6500 },
          { serviceId: "svc-nails", category: "NAILS", priceCents: 1500 },
        ],
        rates
      )
    ).toBe(3900 + 375);
  });

  it("skips a line with no price rather than counting it as free work", () => {
    expect(commissionCents([{ serviceId: null, category: null, priceCents: null }], rates)).toBe(0);
  });

  it("reports the blended rate, and nothing for no money", () => {
    const lines = [
      { serviceId: "svc-fullgroom", category: "GROOM" as const, priceCents: 6500 },
      { serviceId: "svc-nails", category: "NAILS" as const, priceCents: 1500 },
    ];
    expect(effectiveRatePercent(lines, rates)).toBe(53.4);
    expect(effectiveRatePercent([], rates)).toBeNull();
  });
});

describe("payEstimate", () => {
  it("is commission when commission is higher", () => {
    expect(
      payEstimate({ commissionCents: 20000, hourlyRateCents: 1800, minutesScheduled: 480 })
    ).toEqual({ cents: 20000, floorCents: 14400, flooredBy: 0 });
  });

  it("lifts a quiet week to the hourly floor and says by how much", () => {
    expect(
      payEstimate({ commissionCents: 10000, hourlyRateCents: 1800, minutesScheduled: 480 })
    ).toEqual({ cents: 14400, floorCents: 14400, flooredBy: 4400 });
  });

  it("has no floor without both an hourly rate and scheduled time", () => {
    expect(payEstimate({ commissionCents: 10000 }).cents).toBe(10000);
    expect(payEstimate({ commissionCents: 10000, hourlyRateCents: 1800 }).floorCents).toBe(0);
    expect(payEstimate({ commissionCents: 10000, minutesScheduled: 480 }).floorCents).toBe(0);
  });
});
