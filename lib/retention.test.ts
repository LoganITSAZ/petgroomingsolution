import { describe, expect, it } from "vitest";
import { cohortsFrom, summarise, MIN_COHORT_SIZE, RETURN_WINDOW_DAYS, type Visit } from "./retention";

/** Shop time is America/Phoenix (no DST), so a noon instant needs no care. */
const NOW = new Date("2026-09-14T12:00:00-07:00");
const DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

/** `count` customers whose first visit was `first` days ago, each returning after `gap` days. */
function cohort(count: number, first: number, gap: number | null, prefix = "c"): Visit[] {
  const visits: Visit[] = [];
  for (let i = 0; i < count; i++) {
    const customerId = `${prefix}${i}`;
    visits.push({ customerId, at: daysAgo(first) });
    if (gap != null) visits.push({ customerId, at: daysAgo(first - gap) });
  }
  return visits;
}

describe("cohortsFrom", () => {
  it("groups customers by the month of their first visit", () => {
    const visits = [
      { customerId: "a", at: new Date("2026-03-04T17:00:00Z") },
      { customerId: "b", at: new Date("2026-03-29T17:00:00Z") },
      { customerId: "c", at: new Date("2026-04-02T17:00:00Z") },
    ];
    const cohorts = cohortsFrom(visits, NOW);
    expect(cohorts.map((entry) => [entry.monthKey, entry.size])).toEqual([
      ["2026-04", 1],
      ["2026-03", 2],
    ]);
  });

  it("counts a return inside the window and ignores one outside it", () => {
    const inside = cohortsFrom(cohort(MIN_COHORT_SIZE, 300, RETURN_WINDOW_DAYS - 1), NOW)[0];
    expect(inside.returnedInWindow).toBe(MIN_COHORT_SIZE);
    expect(inside.rate).toBe(1);

    const outside = cohortsFrom(cohort(MIN_COHORT_SIZE, 300, RETURN_WINDOW_DAYS + 1), NOW)[0];
    expect(outside.returned).toBe(MIN_COHORT_SIZE);
    expect(outside.returnedInWindow).toBe(0);
    expect(outside.rate).toBe(0);
  });

  it("counts the third visit as loyal, not just returned", () => {
    const visits: Visit[] = [
      { customerId: "a", at: daysAgo(300) },
      { customerId: "a", at: daysAgo(260) },
      { customerId: "a", at: daysAgo(200) },
      { customerId: "b", at: daysAgo(300) },
      { customerId: "b", at: daysAgo(260) },
    ];
    const [entry] = cohortsFrom(visits, NOW);
    expect(entry.returned).toBe(2);
    expect(entry.loyal).toBe(1);
  });

  it("rates nothing while the cohort is still inside its window", () => {
    // Everyone first came in a fortnight ago: most of them have not had their
    // chance to come back yet, so a rate here would read as a collapse.
    const [entry] = cohortsFrom(cohort(MIN_COHORT_SIZE, 14, null), NOW);
    expect(entry.size).toBe(MIN_COHORT_SIZE);
    expect(entry.mature).toBe(false);
    expect(entry.rate).toBeNull();
  });

  it("holds a cohort immature until its youngest first-timer has had the window", () => {
    const visits = [...cohort(4, 300, null, "old"), { customerId: "new", at: daysAgo(10) }];
    const [entry] = cohortsFrom(visits, NOW);
    expect(entry.mature).toBe(false);
  });

  it("rates nothing from too few first-timers", () => {
    const [entry] = cohortsFrom(cohort(MIN_COHORT_SIZE - 1, 300, 30), NOW);
    expect(entry.mature).toBe(true);
    expect(entry.rate).toBeNull();
  });

  it("drops cohorts older than the window asked for", () => {
    const visits = [...cohort(MIN_COHORT_SIZE, 800, 30, "old"), ...cohort(MIN_COHORT_SIZE, 200, 30, "recent")];
    expect(cohortsFrom(visits, NOW, 12)).toHaveLength(1);
    expect(cohortsFrom(visits, NOW, 36)).toHaveLength(2);
  });
});

describe("summarise", () => {
  it("weights the rate by cohort size rather than averaging the rates", () => {
    // 10 first-timers, 10 returns; then 2 cohorts of 5 with none. A mean of the
    // three rates is 33%; the honest figure is 10 of 20.
    const visits = [
      ...cohort(10, 300, 30, "big"),
      ...cohort(5, 240, null, "quietA"),
      ...cohort(5, 200, null, "quietB"),
    ];
    const summary = summarise(cohortsFrom(visits, NOW));
    expect(summary.ratedCustomers).toBe(20);
    expect(summary.ratedReturns).toBe(10);
    expect(summary.returnRate).toBe(0.5);
  });

  it("compares the newest rated cohort with the one before it", () => {
    const visits = [...cohort(10, 300, 30, "then"), ...cohort(10, 200, null, "now")];
    const summary = summarise(cohortsFrom(visits, NOW));
    expect(summary.trend?.change).toBe(-1);
  });

  it("says nothing at all with no mature cohorts", () => {
    const summary = summarise(cohortsFrom(cohort(MIN_COHORT_SIZE, 5, null), NOW));
    expect(summary.returnRate).toBeNull();
    expect(summary.trend).toBeNull();
  });
});
