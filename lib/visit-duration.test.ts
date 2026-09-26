import { describe, expect, it } from "vitest";
import {
  durationReason,
  learnedDuration,
  MIN_DRIFT_MINS,
  MIN_VISITS_FOR_DURATION,
  breedDuration,
  breedReason,
  overrunsFrom,
  typicalOverrunMins,
} from "./visit-duration";

const IN = new Date("2026-09-14T16:00:00Z");

/** A visit booked for `booked` minutes that actually took `actual`. */
function visit(booked: number | null, actual: number, checkedIn: Date | null = IN) {
  return {
    checkedInAt: checkedIn,
    finishedAt: new Date(IN.getTime() + actual * 60_000),
    durationMins: booked,
  };
}

describe("overrunsFrom", () => {
  it("measures each visit against its own booked slot", () => {
    expect(overrunsFrom([visit(60, 75), visit(60, 50)])).toEqual([15, -10]);
  });

  it("skips what it cannot measure rather than calling it zero drift", () => {
    // A zero would pull a real habit back towards the catalog figure.
    expect(overrunsFrom([visit(null, 90), visit(60, 90, null), visit(60, 90)])).toEqual([30]);
  });

  it("measures hands-on time when the history had it, not the wait around it", () => {
    // Checked in to finished took 150 minutes; the groom itself took 70.
    expect(overrunsFrom([{ ...visit(60, 150), workedMins: 70 }])).toEqual([10]);
  });

  it("falls back to check-in to finish when hands-on time was not measured", () => {
    expect(overrunsFrom([{ ...visit(60, 90), workedMins: null }])).toEqual([30]);
  });
});

describe("typicalOverrunMins", () => {
  it("says nothing below the minimum number of visits", () => {
    expect(typicalOverrunMins([30, 30])).toBeNull();
  });

  it("ignores drift too small to move a slot for", () => {
    expect(typicalOverrunMins([MIN_DRIFT_MINS - 1, 0, 2])).toBeNull();
  });

  it("takes the median, so one bad afternoon does not rewrite the slot", () => {
    expect(typicalOverrunMins([15, 20, 240])).toBe(20);
  });

  it("reports a pet that finishes early", () => {
    expect(typicalOverrunMins([-20, -25, -20])).toBe(-20);
  });

  it("needs exactly the minimum, not more", () => {
    expect(typicalOverrunMins(Array(MIN_VISITS_FOR_DURATION).fill(20))).toBe(20);
  });
});

describe("learnedDuration", () => {
  it("leaves the catalog figure alone when there is no habit", () => {
    expect(learnedDuration(60, null)).toBe(60);
  });

  it("rounds the adjusted slot to five minutes", () => {
    expect(learnedDuration(60, 18)).toBe(80);
    expect(learnedDuration(60, -13)).toBe(45);
  });

  it("caps at double the catalog slot", () => {
    // Turnaround is check-in to finish, so an afternoon spent waiting for an
    // owner reads as a four-hour groom. It must not book the next one.
    expect(learnedDuration(60, 300)).toBe(120);
  });

  it("never falls below half the catalog slot", () => {
    expect(learnedDuration(60, -50)).toBe(30);
  });

  it("keeps a short slot bookable", () => {
    expect(learnedDuration(10, -30)).toBe(5);
  });
});

describe("durationReason", () => {
  it("says nothing when the catalog figure stood", () => {
    expect(durationReason(60, 60, 5)).toBeNull();
  });

  it("names the drift, the direction and the evidence", () => {
    expect(durationReason(60, 80, 5)).toBe(
      "Booked 20 min longer than the 60 min catalog slot: this pet's last 5 visits ran that way."
    );
    expect(durationReason(60, 45, 4)).toContain("15 min shorter");
  });
});

describe("breedDuration", () => {
  it("stands aside with no guide figure", () => {
    expect(breedDuration(60, null)).toBe(60);
    expect(breedDuration(60, 0)).toBe(60);
  });

  it("leaves a short booking alone — the guide describes a full groom", () => {
    expect(breedDuration(15, 120)).toBe(15);
  });

  it("takes the breed figure for a groom-length slot", () => {
    expect(breedDuration(90, 120)).toBe(120);
  });

  it("refuses a figure more than double the slot rather than clamping it", () => {
    expect(breedDuration(60, 150)).toBe(60);
  });

  it("never books under half the catalog slot", () => {
    expect(breedDuration(120, 40)).toBe(60);
  });

  it("ignores drift inside the noise", () => {
    expect(breedDuration(120, 125)).toBe(120);
  });

  it("books shorter when the breed is quicker", () => {
    expect(breedDuration(120, 90)).toBe(90);
  });

  it("says why, and only when something moved", () => {
    expect(breedReason(90, 120, "Poodle")).toContain("30 min longer");
    expect(breedReason(90, 120, "Poodle")).toContain("Poodle");
    expect(breedReason(90, 90, "Poodle")).toBeNull();
  });
});
