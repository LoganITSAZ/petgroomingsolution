import { describe, expect, it } from "vitest";
import { forecastFrom, predictionsFrom } from "./demand";
import { shopDayKey } from "./utils";

const NOW = new Date("2026-09-14T12:00:00-07:00");
const DAY = 86_400_000;

function dayAt(offset: number): Date {
  return new Date(NOW.getTime() + offset * DAY);
}

function rhythm(overrides: Partial<{ cadenceDays: number | null; lastVisit: Date | null; hasUpcoming: boolean }> = {}) {
  return {
    cadenceDays: 30,
    lastVisit: new Date(NOW.getTime() - 27 * DAY),
    hasUpcoming: false,
    ...overrides,
  };
}

function rhythms(entries: ReturnType<typeof rhythm>[]) {
  return new Map(entries.map((entry, index) => [`c${index}`, entry]));
}

describe("predictionsFrom", () => {
  it("puts a household on the day its own cadence points at", () => {
    const predicted = predictionsFrom(rhythms([rhythm()]), 14, NOW);
    expect(predicted).toEqual([{ dayKey: shopDayKey(dayAt(3)) }]);
  });

  it("ignores a household that is already in the diary", () => {
    expect(predictionsFrom(rhythms([rhythm({ hasUpcoming: true })]), 14, NOW)).toEqual([]);
  });

  it("ignores a household with no cadence yet", () => {
    expect(predictionsFrom(rhythms([rhythm({ cadenceDays: null })]), 14, NOW)).toEqual([]);
  });

  it("ignores a household already past its date", () => {
    // They could ring any day, which is not a forecast for a particular one.
    // The rebooking call list is the screen that exists for them.
    const overdue = rhythm({ lastVisit: new Date(NOW.getTime() - 60 * DAY) });
    expect(predictionsFrom(rhythms([overdue]), 14, NOW)).toEqual([]);
  });

  it("ignores a household due beyond the horizon", () => {
    const distant = rhythm({ cadenceDays: 90, lastVisit: new Date(NOW.getTime() - 10 * DAY) });
    expect(predictionsFrom(rhythms([distant]), 14, NOW)).toEqual([]);
    expect(predictionsFrom(rhythms([distant]), 90, NOW)).toHaveLength(1);
  });
});

describe("forecastFrom", () => {
  it("adds expected returns on top of the diary", () => {
    const days = [dayAt(0), dayAt(1)];
    const booked = new Map([[shopDayKey(days[0]), 4]]);
    const predictions = [
      { dayKey: shopDayKey(days[0]) },
      { dayKey: shopDayKey(days[1]) },
      { dayKey: shopDayKey(days[1]) },
    ];

    expect(forecastFrom(days, booked, predictions)).toEqual([
      { dayKey: shopDayKey(days[0]), day: days[0], booked: 4, expected: 1, likely: 5 },
      { dayKey: shopDayKey(days[1]), day: days[1], booked: 0, expected: 2, likely: 2 },
    ]);
  });

  it("drops a prediction that lands outside the days asked for", () => {
    const days = [dayAt(0)];
    const forecast = forecastFrom(days, new Map(), [{ dayKey: shopDayKey(dayAt(9)) }]);
    expect(forecast).toHaveLength(1);
    expect(forecast[0].likely).toBe(0);
  });

  it("reports an empty fortnight rather than nothing at all", () => {
    const days = [dayAt(0), dayAt(1)];
    expect(forecastFrom(days, new Map(), []).map((day) => day.likely)).toEqual([0, 0]);
  });
});
