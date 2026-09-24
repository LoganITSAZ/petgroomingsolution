import { describe, it, expect } from "vitest";
import { calendarWeeks, shiftDayKey, unitBounds, weekdayIndex } from "@/lib/calendar-grid";

describe("shiftDayKey", () => {
  it("crosses a month and a year", () => {
    expect(shiftDayKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a leap day", () => {
    expect(shiftDayKey("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("unitBounds", () => {
  it("takes the Sunday-to-Saturday week around a day", () => {
    // 2026-09-23 is a Wednesday.
    expect(weekdayIndex("2026-09-23")).toBe(3);
    expect(unitBounds("2026-09-23", "week")).toEqual({
      first: "2026-09-20",
      last: "2026-09-26",
    });
  });

  it("takes the whole calendar month, whatever its length", () => {
    expect(unitBounds("2026-09-23", "month")).toEqual({
      first: "2026-09-01",
      last: "2026-09-30",
    });
    expect(unitBounds("2026-02-10", "month").last).toBe("2026-02-28");
    expect(unitBounds("2028-02-10", "month").last).toBe("2028-02-29");
    expect(unitBounds("2026-12-31", "month").last).toBe("2026-12-31");
  });
});

describe("calendarWeeks", () => {
  it("is one row for a week", () => {
    const weeks = calendarWeeks("2026-09-23", "week");
    expect(weeks).toHaveLength(1);
    expect(weeks[0][0]).toBe("2026-09-20");
    expect(weeks[0][6]).toBe("2026-09-26");
  });

  it("pads a month out to whole weeks, in order and with no gaps", () => {
    const weeks = calendarWeeks("2026-09-23", "month");
    const days = weeks.flat();
    // September 2026 starts on a Tuesday, so the grid opens on August 30.
    expect(days[0]).toBe("2026-08-30");
    expect(days[days.length - 1]).toBe("2026-10-03");
    expect(days).toHaveLength(weeks.length * 7);
    for (const week of weeks) expect(week).toHaveLength(7);
    days.forEach((day, index) => {
      if (index > 0) expect(day).toBe(shiftDayKey(days[index - 1], 1));
    });
    expect(days).toContain("2026-09-30");
  });

  it("covers a month that begins on a Sunday without a leading row", () => {
    // 2026-11-01 is a Sunday.
    const weeks = calendarWeeks("2026-11-15", "month");
    expect(weeks[0][0]).toBe("2026-11-01");
  });
});
