import { describe, expect, it } from "vitest";
import { rewardDiscountFor } from "./rewards";

/**
 * The punch card is counted in visits and paid out in money. A reward is
 * money OFF, never money back — the shop hands over a discount, not change.
 */
describe("rewardDiscountFor", () => {
  it("takes the reward's value off the bill", () => {
    expect(rewardDiscountFor(4500, 1000)).toBe(1000);
  });

  it("never discounts more than the bill", () => {
    // An $8 visit against a $10 reward settles at zero, it does not owe $2.
    expect(rewardDiscountFor(800, 1000)).toBe(800);
  });

  it("applies several rewards at once, still capped by the bill", () => {
    expect(rewardDiscountFor(4500, 1000, 3)).toBe(3000);
    expect(rewardDiscountFor(2500, 1000, 3)).toBe(2500);
  });

  it("discounts nothing on an empty bill", () => {
    expect(rewardDiscountFor(0, 1000)).toBe(0);
  });

  it("treats a mis-saved negative value or count as nothing", () => {
    expect(rewardDiscountFor(4500, -1000)).toBe(0);
    expect(rewardDiscountFor(4500, 1000, -2)).toBe(0);
  });

  it("refuses to turn a negative bill into a discount", () => {
    expect(rewardDiscountFor(-500, 1000)).toBe(0);
  });

  it("rounds a fractional value to whole cents", () => {
    expect(rewardDiscountFor(4500, 999.6)).toBe(1000);
  });
});
