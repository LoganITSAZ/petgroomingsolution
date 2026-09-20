import { describe, expect, it } from "vitest";
import { missedVisitMessage } from "./no-show";

// 14 Aug 2026, 18:00 UTC — 11:00 in Phoenix, so the shop's date and UTC's
// agree here and the assertion is about the wording, not the timezone.
const LAST = new Date("2026-08-14T18:00:00Z");

describe("missedVisitMessage", () => {
  it("names the fee to both audiences in their own terms", () => {
    const missed = { count: 2, lastMissedAt: LAST, feeCents: 2500 };

    const owner = missedVisitMessage(missed, true);
    expect(owner).toContain("You missed 2 appointments");
    expect(owner).toContain("$25 missed-appointment fee");
    expect(owner).toContain("Aug 14, 2026");

    const counter = missedVisitMessage(missed, false);
    expect(counter).toContain("This household missed 2 appointments");
    expect(counter).toContain("the counter adds it on the next visit");
  });

  /* A shop that retires the surcharge charges nothing, and the app must not
     threaten a number it will not collect. The miss is still worth naming. */
  it("drops the amount when no fee is published", () => {
    const missed = { count: 1, lastMissedAt: LAST, feeCents: null };

    expect(missedVisitMessage(missed, true)).toBe(
      "You missed an appointment recently — the last on Aug 14, 2026. Please call us if you cannot make this one."
    );
    expect(missedVisitMessage(missed, false)).not.toContain("fee is");
  });

  it("counts one miss in the singular", () => {
    const one = missedVisitMessage({ count: 1, lastMissedAt: LAST, feeCents: 2500 }, true);
    expect(one).toContain("You missed an appointment");
    expect(one).not.toContain("1 appointments");
  });
});
