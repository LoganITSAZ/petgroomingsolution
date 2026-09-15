import { describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import { type RemindableVisit, selectVisitsToRemind } from "./reminders";

const NOW = new Date("2026-09-14T16:00:00Z");
const WINDOW = { reminderHoursBefore: 24, bookingLeadHours: 2 };

function visit(hoursFromNow: number, overrides: Partial<RemindableVisit> = {}): RemindableVisit {
  return {
    id: `v${hoursFromNow}`,
    scheduledAt: new Date(NOW.getTime() + hoursFromNow * 3_600_000),
    status: AppointmentStatus.SCHEDULED,
    reminded: false,
    ...overrides,
  };
}

function ids(visits: RemindableVisit[], window = WINDOW) {
  return selectVisitsToRemind(visits, window, NOW).map((entry) => entry.id);
}

describe("selectVisitsToRemind", () => {
  it("reminds a visit inside the window", () => {
    expect(ids([visit(20)])).toEqual(["v20"]);
  });

  it("includes the far edge of the window", () => {
    expect(ids([visit(24)])).toEqual(["v24"]);
  });

  it("leaves a visit beyond the window for a later run", () => {
    expect(ids([visit(25)])).toEqual([]);
  });

  // An hour's notice is noise; the shop's own booking lead time is the floor.
  it("skips a visit inside the booking lead time", () => {
    expect(ids([visit(1)])).toEqual([]);
  });

  it("reminds just past the lead time", () => {
    expect(ids([visit(2.5)])).toEqual(["v2.5"]);
  });

  it("does not remind about a visit already in the past", () => {
    expect(ids([visit(-3)])).toEqual([]);
  });

  it("never reminds twice", () => {
    expect(ids([visit(20, { reminded: true })])).toEqual([]);
  });

  // The status filter is what excludes cancelled, no-show, and a pet already
  // standing in the shop.
  it("ignores a visit that has moved on from SCHEDULED", () => {
    for (const status of [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
    ]) {
      expect(ids([visit(20, { status })])).toEqual([]);
    }
  });

  it("follows a shop that reminds a week ahead", () => {
    const week = { reminderHoursBefore: 168, bookingLeadHours: 2 };
    expect(ids([visit(100)], week)).toEqual(["v100"]);
  });

  it("treats a zero reminder window as an hour rather than nothing", () => {
    const broken = { reminderHoursBefore: 0, bookingLeadHours: 0 };
    expect(ids([visit(0.5)], broken)).toEqual(["v0.5"]);
  });
});
