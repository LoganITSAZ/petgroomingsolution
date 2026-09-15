import { describe, expect, it } from "vitest";
import { cadenceDays, rebookingDue, rebookingEvidence, type RebookingHistory } from "./rebooking";

/**
 * Shop time is America/Phoenix (no DST), so a noon instant is unambiguous and
 * day counting is what is under test rather than the formatter.
 */
const NOW = new Date("2026-09-14T12:00:00-07:00");

/** A visit `daysAgo` before NOW. */
function visit(daysAgo: number, id = `v${daysAgo}`) {
  return { id, at: new Date(NOW.getTime() - daysAgo * 86_400_000) };
}

function history(overrides: Partial<RebookingHistory> = {}): RebookingHistory[] {
  return [
    {
      customerId: "c1",
      visits: [visit(150), visit(110), visit(70)],
      hasUpcoming: false,
      prompted: false,
      ...overrides,
    },
  ];
}

describe("cadenceDays", () => {
  it("says nothing from two visits", () => {
    expect(cadenceDays([visit(80), visit(40)])).toBeNull();
  });

  it("takes the median, not the mean", () => {
    // Gaps of 40, 40 and 200 days: a mean would read 93.
    const visits = [visit(320), visit(280), visit(240), visit(40)];
    expect(cadenceDays(visits)).toBe(40);
  });

  it("ignores two visits on one day", () => {
    // A second groom the same morning is one trip, not a zero-day cadence.
    expect(cadenceDays([visit(90), visit(50), visit(50), visit(10)])).toBe(40);
  });
});

describe("rebookingDue", () => {
  it("leaves a customer alone inside their cadence plus grace", () => {
    // Cadence 40, last seen 44 days ago, 7 days of grace: not yet.
    const rows = [{ ...history()[0], visits: [visit(124), visit(84), visit(44)] }];
    expect(rebookingDue(rows, { graceDays: 7 }, NOW)).toHaveLength(0);
  });

  it("reports them the day the grace runs out", () => {
    const rows = [{ ...history()[0], visits: [visit(127), visit(87), visit(47)] }];
    const [due] = rebookingDue(rows, { graceDays: 7 }, NOW);
    expect(due.cadenceDays).toBe(40);
    expect(due.daysSince).toBe(47);
    expect(due.daysOverdue).toBe(7);
    expect(due.lapsing).toBe(false);
  });

  it("anchors on the most recent visit", () => {
    const [due] = rebookingDue(history(), { graceDays: 0 }, NOW);
    expect(due.lastVisitId).toBe("v70");
  });

  it("says nothing when something is booked", () => {
    expect(rebookingDue(history({ hasUpcoming: true }), { graceDays: 0 }, NOW)).toHaveLength(0);
  });

  it("says nothing from too little history", () => {
    expect(
      rebookingDue(history({ visits: [visit(200), visit(160)] }), { graceDays: 0 }, NOW)
    ).toHaveLength(0);
  });

  it("calls twice the cadence lapsing", () => {
    // Cadence 40, last seen 80 days ago.
    const rows = [{ ...history()[0], visits: [visit(160), visit(120), visit(80)] }];
    expect(rebookingDue(rows, { graceDays: 7 }, NOW)[0].lapsing).toBe(true);
  });

  it("keeps a prompted customer on the list, flagged", () => {
    const [due] = rebookingDue(history({ prompted: true }), { graceDays: 0 }, NOW);
    expect(due.prompted).toBe(true);
  });

  it("puts the lapsing first, then the furthest past their own cadence", () => {
    const rows: RebookingHistory[] = [
      { customerId: "late", visits: [visit(160), visit(120), visit(85)], hasUpcoming: false, prompted: false },
      { customerId: "lapsed", visits: [visit(200), visit(160), visit(120)], hasUpcoming: false, prompted: false },
      { customerId: "just-due", visits: [visit(130), visit(90), visit(49)], hasUpcoming: false, prompted: false },
    ];
    expect(rebookingDue(rows, { graceDays: 7 }, NOW).map((row) => row.customerId)).toEqual([
      "lapsed",
      "late",
      "just-due",
    ]);
  });

  it("floors a negative grace rather than chasing early", () => {
    // Cadence 40 either way; grace cannot go below zero, so 41 days is due
    // and 39 is not.
    const rows = [{ ...history()[0], visits: [visit(121), visit(81), visit(41)] }];
    expect(rebookingDue(rows, { graceDays: -30 }, NOW)).toHaveLength(1);
    const rows2 = [{ ...history()[0], visits: [visit(119), visit(79), visit(39)] }];
    expect(rebookingDue(rows2, { graceDays: -30 }, NOW)).toHaveLength(0);
  });
});

describe("rebookingEvidence", () => {
  it("carries the numbers behind the claim", () => {
    const [due] = rebookingDue(history(), { graceDays: 0 }, NOW);
    expect(rebookingEvidence(due)).toBe(
      "Books about every 40 days across 3 visits; last seen 70 days ago with nothing booked."
    );
  });
});
