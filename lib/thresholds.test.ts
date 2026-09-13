import { describe, expect, it } from "vitest";
import { isAscending, isEndAfterStart } from "./thresholds";

describe("isAscending", () => {
  it("is true for strictly increasing values", () => {
    expect(isAscending([5, 15, 30])).toBe(true);
  });

  it("is false when a later value doesn't exceed an earlier one", () => {
    expect(isAscending([5, 15, 15])).toBe(false);
    expect(isAscending([5, 4, 30])).toBe(false);
  });

  it("is true for a single value or an empty list", () => {
    expect(isAscending([5])).toBe(true);
    expect(isAscending([])).toBe(true);
  });

  it("is false as soon as one pair breaks the order, regardless of length", () => {
    expect(isAscending([1, 2, 3, 3, 5])).toBe(false);
  });
});

describe("isEndAfterStart", () => {
  it("is true when the end comes after the start", () => {
    expect(isEndAfterStart("2026-01-01T09:00", "2026-01-02T09:00")).toBe(true);
  });

  it("is false when the end is before or equal to the start", () => {
    expect(isEndAfterStart("2026-01-02T09:00", "2026-01-01T09:00")).toBe(false);
    expect(isEndAfterStart("2026-01-01T09:00", "2026-01-01T09:00")).toBe(false);
  });

  it("is true when either side is blank — an open-ended window is never a conflict", () => {
    expect(isEndAfterStart("", "2026-01-01T09:00")).toBe(true);
    expect(isEndAfterStart("2026-01-01T09:00", "")).toBe(true);
    expect(isEndAfterStart("", "")).toBe(true);
  });
});
