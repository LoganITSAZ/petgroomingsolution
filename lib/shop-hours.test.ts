import { afterEach, describe, expect, it, vi } from "vitest";
import { shopState, summariseHours, todayLabel, type BusinessHours } from "@/lib/shop-hours";

// The shop is in America/Phoenix and the server is not, so every case below
// is pinned to a UTC instant and read back as shop wall clock.
const HOURS: BusinessHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

afterEach(() => vi.useRealTimers());

function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return new Date();
}

describe("shopState", () => {
  it("is open during the day", () => {
    // 2026-09-15 18:00Z = Tue 11:00 in Phoenix.
    expect(shopState(HOURS, at("2026-09-15T18:00:00Z"))).toEqual({
      open: true,
      label: "Open till 5pm",
    });
  });

  it("closes at the closing minute, not after it", () => {
    // Tue 17:00 Phoenix exactly.
    expect(shopState(HOURS, at("2026-09-16T00:00:00Z"))?.open).toBe(false);
  });

  it("names today's opening when the shop has not opened yet", () => {
    // Tue 06:30 Phoenix.
    expect(shopState(HOURS, at("2026-09-15T13:30:00Z"))?.label).toBe("Closed · opens 8am");
  });

  it("skips a closed day to the next one that opens", () => {
    // Sun 12:00 Phoenix — the shop is shut on Sunday.
    expect(shopState(HOURS, at("2026-09-13T19:00:00Z"))?.label).toBe("Closed · opens Mon 8am");
  });

  it("wraps past the end of the week", () => {
    // Sat 15:00 Phoenix, after closing; Sunday is shut.
    expect(shopState(HOURS, at("2026-09-19T22:00:00Z"))?.label).toBe("Closed · opens Mon 8am");
  });

  it("makes no claim when no hours are configured", () => {
    expect(shopState({}, at("2026-09-15T18:00:00Z"))).toBeNull();
  });
});

describe("todayLabel", () => {
  it("reads the shop's own day, not the server's", () => {
    // Sat 22:00 Phoenix is already Sunday in UTC.
    expect(todayLabel(HOURS, at("2026-09-20T05:00:00Z"))).toBe("Today 9am – 2pm");
  });

  it("says so on a closed day", () => {
    expect(todayLabel(HOURS, at("2026-09-13T19:00:00Z"))).toBe("Closed today");
  });
});

describe("summariseHours", () => {
  it("collapses consecutive identical days and starts at Monday", () => {
    expect(summariseHours(HOURS)).toEqual([
      "Mon – Fri: 8am – 5pm",
      "Sat: 9am – 2pm",
      "Sun: Closed",
    ]);
  });
});
