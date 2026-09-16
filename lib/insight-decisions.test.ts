import { describe, expect, it } from "vitest";
import { MAX_SNOOZE_DAYS, SNOOZE_OPTIONS, withoutSnoozed } from "./insight-decisions";

describe("withoutSnoozed", () => {
  const insights = [{ id: "anomaly-no-shows" }, { id: "rebooking" }, { id: "peak" }];

  it("hides what somebody has dealt with", () => {
    expect(withoutSnoozed(insights, new Set(["rebooking"])).map((i) => i.id)).toEqual([
      "anomaly-no-shows",
      "peak",
    ]);
  });

  it("leaves the list alone when nothing is snoozed", () => {
    expect(withoutSnoozed(insights, new Set())).toHaveLength(3);
  });

  it("ignores a snooze for an insight that is no longer produced", () => {
    expect(withoutSnoozed(insights, new Set(["retired-insight"]))).toHaveLength(3);
  });
});

describe("snooze options", () => {
  it("offers nothing longer than the clamp the write applies", () => {
    for (const option of SNOOZE_OPTIONS) {
      expect(option.days).toBeGreaterThanOrEqual(1);
      expect(option.days).toBeLessThanOrEqual(MAX_SNOOZE_DAYS);
    }
  });
});
