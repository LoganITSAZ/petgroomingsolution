import { describe, expect, it } from "vitest";
import { usualAddOns } from "./add-ons";

const GROOM = "groom";
const NAILS = "nails";
const TEETH = "teeth";

describe("usualAddOns", () => {
  it("names what the pet usually gets and today's ticket does not", () => {
    const history = [
      [GROOM, NAILS],
      [GROOM, NAILS],
      [GROOM, NAILS],
      [GROOM],
    ];

    expect(usualAddOns(history, [GROOM])).toEqual([{ serviceId: NAILS, seen: 3, of: 4 }]);
  });

  it("says nothing about what is already on the ticket", () => {
    const history = [
      [GROOM, NAILS],
      [GROOM, NAILS],
      [GROOM, NAILS],
    ];

    expect(usualAddOns(history, [GROOM, NAILS])).toEqual([]);
  });

  /* The insights rule: a habit read off two visits is a coincidence, and a
     prompt built on one is how the counter learns to ignore the box. */
  it("produces nothing below the pattern minimum", () => {
    expect(usualAddOns([[GROOM, NAILS], [GROOM, NAILS]], [GROOM])).toEqual([]);
  });

  it("holds out for half the visits, not one of them", () => {
    const history = [
      [GROOM, TEETH],
      [GROOM],
      [GROOM],
      [GROOM],
    ];

    expect(usualAddOns(history, [GROOM])).toEqual([]);
  });

  it("counts a service once per visit, however many lines carried it", () => {
    const history = [
      [NAILS, NAILS],
      [NAILS],
      [NAILS],
    ];

    expect(usualAddOns(history, [])).toEqual([{ serviceId: NAILS, seen: 3, of: 3 }]);
  });

  it("puts the strongest habit first", () => {
    const history = [
      [NAILS, TEETH],
      [NAILS, TEETH],
      [NAILS],
      [NAILS],
    ];

    expect(usualAddOns(history, [])).toEqual([
      { serviceId: NAILS, seen: 4, of: 4 },
      { serviceId: TEETH, seen: 2, of: 4 },
    ]);
  });
});
