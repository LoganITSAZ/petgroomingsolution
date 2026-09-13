import { describe, expect, it, afterEach, vi } from "vitest";
import { validateBookingTime } from "./booking-validation";
import type { BusinessHours } from "./shop-hours";

// Mon–Fri 8–5, Saturday 9–3, closed Sunday.
const HOURS: BusinessHours = {
  sunday: null,
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "15:00" },
};

// Phoenix never observes DST, so a fixed -07:00 offset is exact year-round.
const at = (iso: string) => new Date(`${iso}-07:00`);

// Wednesday 2026-09-16, 9am shop time.
const NOW = at("2026-09-16T09:00:00");

const base = {
  hours: HOURS,
  leadHours: 2,
  windowDays: 30,
  enforceWindow: true,
  now: NOW,
};

afterEach(() => vi.useRealTimers());

describe("validateBookingTime", () => {
  it("accepts a time inside opening hours and outside the lead window", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T10:00:00") })).toBeNull();
  });

  it("refuses a time in the past", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-15T10:00:00") }))
      .toMatchObject({ code: "PAST" });
  });

  it("refuses a day the shop is closed", () => {
    // Sunday.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-20T10:00:00") }))
      .toMatchObject({ code: "CLOSED_DAY" });
  });

  it("refuses a time before opening", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T07:30:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("refuses a time at or after closing", () => {
    // Close is exclusive: a 5pm booking on a shop that shuts at 5pm is refused.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T17:00:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("uses that day's own hours, not yesterday's", () => {
    // Saturday shuts at 3pm even though weekdays run to 5pm.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-19T16:00:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-19T14:00:00") })).toBeNull();
  });

  it("refuses a booking inside the lead window", () => {
    // 10am today, with a 2-hour lead at 9am.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-16T10:00:00") }))
      .toMatchObject({ code: "TOO_SOON" });
  });

  it("accepts a booking exactly at the lead boundary", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-16T11:00:00") })).toBeNull();
  });

  it("refuses a booking beyond the booking window", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-11-02T10:00:00") }))
      .toMatchObject({ code: "TOO_FAR" });
  });

  it("skips the lead and window checks for staff", () => {
    const staff = { ...base, enforceWindow: false };
    // Ten minutes from now: a customer at the counter.
    expect(validateBookingTime({ ...staff, scheduledAt: at("2026-09-16T09:10:00") })).toBeNull();
    expect(validateBookingTime({ ...staff, scheduledAt: at("2026-11-02T10:00:00") })).toBeNull();
  });

  it("still refuses the past for staff", () => {
    expect(validateBookingTime({
      ...base,
      enforceWindow: false,
      scheduledAt: at("2026-09-15T10:00:00"),
    })).toMatchObject({ code: "PAST" });
  });

  it("accepts any open-hours time when the shop has published no hours", () => {
    expect(validateBookingTime({ ...base, hours: null, scheduledAt: at("2026-09-20T10:00:00") }))
      .toBeNull();
  });

  it("evaluates the day in shop time, not the server's zone", () => {
    // 2026-09-20T01:00:00Z is Sunday in UTC but still Saturday 6pm in Phoenix —
    // and Saturday shuts at 3pm, so this is OUTSIDE_HOURS, never CLOSED_DAY.
    expect(validateBookingTime({ ...base, scheduledAt: new Date("2026-09-20T01:00:00Z") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("defaults `now` to the real clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(validateBookingTime({
      hours: HOURS,
      leadHours: 2,
      windowDays: 30,
      enforceWindow: true,
      scheduledAt: at("2026-09-16T10:00:00"),
    })).toMatchObject({ code: "TOO_SOON" });
  });
});
