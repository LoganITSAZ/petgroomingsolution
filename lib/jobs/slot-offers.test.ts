import { describe, expect, it } from "vitest";
import { rankForSlot } from "./slot-offers";

const DAY = 24 * 60 * 60 * 1000;
const slot = new Date("2026-09-24T17:00:00Z");

function rhythm(cadenceDays: number | null, lastVisitDaysAgoOfSlot: number, hasUpcoming = false) {
  return {
    cadenceDays,
    lastVisit: cadenceDays == null ? null : new Date(slot.getTime() - lastVisitDaysAgoOfSlot * DAY),
    hasUpcoming,
  };
}

describe("rankForSlot", () => {
  it("offers the slot to the household whose own date is nearest it", () => {
    // Due on the day / three days after / eleven days after.
    const ranked = rankForSlot(
      new Map([
        ["late", rhythm(30, 33)],
        ["exact", rhythm(30, 30)],
        ["early", rhythm(30, 19)],
      ]),
      slot,
      14,
      5
    );
    expect(ranked.map((row) => row.customerId)).toEqual(["exact", "late", "early"]);
  });

  it("counts a household already past due as near, not as ineligible", () => {
    const ranked = rankForSlot(new Map([["overdue", rhythm(30, 35)]]), slot, 14, 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].daysApart).toBe(5);
  });

  it("leaves out anyone already in the diary", () => {
    const ranked = rankForSlot(new Map([["booked", rhythm(30, 30, true)]]), slot, 14, 5);
    expect(ranked).toEqual([]);
  });

  it("leaves out a household with no cadence yet", () => {
    expect(rankForSlot(new Map([["new", rhythm(null, 0)]]), slot, 14, 5)).toEqual([]);
  });

  it("will not pester somebody outside the window", () => {
    // Due five weeks after the slot: they were in last month.
    expect(rankForSlot(new Map([["fresh", rhythm(30, -5)]]), slot, 14, 5)).toEqual([]);
  });

  it("stops at the shop's cap on recipients", () => {
    const rhythms = new Map(
      Array.from({ length: 10 }, (_, i) => [`c${i}`, rhythm(30, 30 + i)] as const)
    );
    expect(rankForSlot(rhythms, slot, 14, 3)).toHaveLength(3);
  });

  it("offers nobody when the cap is zero", () => {
    expect(rankForSlot(new Map([["a", rhythm(30, 30)]]), slot, 14, 0)).toEqual([]);
  });
});
