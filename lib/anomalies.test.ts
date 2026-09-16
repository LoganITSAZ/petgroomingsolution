import { describe, expect, it } from "vitest";
import { BASELINE_DAYS, RECENT_DAYS, compareWindows, settled, type Window } from "./anomalies";

/** A normal eight weeks: plenty of visits, a 5% no-show rate, few walk-ins. */
const BASELINE: Window = {
  days: BASELINE_DAYS,
  finished: 180,
  noShows: 10,
  cancelled: 10,
  walkIns: 20,
};

/** A week matching that baseline exactly, at a seventh of the volume. */
function normalWeek(overrides: Partial<Window> = {}): Window {
  return {
    days: RECENT_DAYS,
    finished: Math.round(BASELINE.finished / 8),
    noShows: Math.round(BASELINE.noShows / 8),
    cancelled: Math.round(BASELINE.cancelled / 8),
    walkIns: Math.round(BASELINE.walkIns / 8),
    ...overrides,
  };
}

function ids(insights: { id: string }[]): string[] {
  return insights.map((insight) => insight.id);
}

describe("settled", () => {
  it("counts every visit that reached an outcome", () => {
    expect(settled(BASELINE)).toBe(200);
  });
});

describe("compareWindows", () => {
  it("says nothing about a week that matches the shop's normal", () => {
    expect(compareWindows(normalWeek(), BASELINE)).toEqual([]);
  });

  it("refuses to speak from too little recent history", () => {
    const quiet: Window = { days: RECENT_DAYS, finished: 2, noShows: 3, cancelled: 0, walkIns: 0 };
    expect(compareWindows(quiet, BASELINE)).toEqual([]);
  });

  it("refuses to speak with no baseline to be unlike", () => {
    const thin: Window = { days: BASELINE_DAYS, finished: 10, noShows: 1, cancelled: 0, walkIns: 0 };
    expect(compareWindows(normalWeek({ noShows: 10 }), thin)).toEqual([]);
  });

  it("reports a no-show rate that has jumped", () => {
    const week = compareWindows(normalWeek({ noShows: 8 }), BASELINE);
    expect(ids(week)).toContain("anomaly-no-shows");
    expect(week[0].evidence).toContain("8 of");
  });

  it("stays quiet when a rate doubles but is still tiny", () => {
    // 1% to 2% is a doubling and means nothing; the absolute floor catches it.
    const big: Window = { days: BASELINE_DAYS, finished: 990, noShows: 10, cancelled: 0, walkIns: 0 };
    const week: Window = { days: RECENT_DAYS, finished: 98, noShows: 2, cancelled: 0, walkIns: 0 };
    expect(ids(compareWindows(week, big))).not.toContain("anomaly-no-shows");
  });

  it("stays quiet when a rate moves a lot in points but little in proportion", () => {
    // 40% to 46% is six points on a shop that always runs high. Not news.
    const rough: Window = { days: BASELINE_DAYS, finished: 120, noShows: 80, cancelled: 0, walkIns: 0 };
    const week: Window = { days: RECENT_DAYS, finished: 27, noShows: 23, cancelled: 0, walkIns: 0 };
    expect(ids(compareWindows(week, rough))).not.toContain("anomaly-no-shows");
  });

  it("never calls a fall in no-shows a problem", () => {
    const calm = compareWindows(normalWeek({ noShows: 0, finished: 30 }), BASELINE);
    expect(ids(calm)).not.toContain("anomaly-no-shows");
  });

  it("reports walk-ins moving in either direction", () => {
    expect(ids(compareWindows(normalWeek({ walkIns: 15 }), BASELINE))).toContain("anomaly-walk-ins");
    const noneLeft = compareWindows(normalWeek({ walkIns: 0 }), { ...BASELINE, walkIns: 80 });
    expect(ids(noneLeft)).toContain("anomaly-walk-ins");
  });

  it("reports a quiet week by visits a day, not by share", () => {
    const quiet = compareWindows(normalWeek({ finished: 8 }), BASELINE);
    const volume = quiet.find((insight) => insight.id === "anomaly-volume");
    expect(volume?.title).toContain("quieter");
    expect(volume?.tone).toBe("warning");
  });

  it("reports a busy week as something to staff for", () => {
    const busy = compareWindows(normalWeek({ finished: 60 }), BASELINE);
    const volume = busy.find((insight) => insight.id === "anomaly-volume");
    expect(volume?.title).toContain("busier");
    expect(volume?.href).toBe("/admin/schedule");
  });
});
