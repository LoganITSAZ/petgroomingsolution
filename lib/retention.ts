import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { shopDayKey } from "@/lib/utils";

/**
 * Does the shop keep the people it wins?
 *
 * Every other figure on the analytics screen describes throughput — how many
 * pets went through, what they were worth, who finished them. None of them
 * answer the question a shop owner actually loses sleep over: of the people who
 * came in for the first time, how many came back.
 *
 * Grouped by the month of a customer's FIRST finished visit, because a rate
 * measured over everyone at once moves the day a marketing push lands and then
 * never moves again. A cohort is a fixed group of people, so its rate is
 * comparable to the month before it.
 */

/** How long a first-time customer is given to come back before they are counted as lost. */
export const RETURN_WINDOW_DAYS = 90;

/** Below this many first-timers, a cohort's rate is noise. Same rule as lib/insights.ts. */
export const MIN_COHORT_SIZE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Visit {
  customerId: string;
  at: Date;
}

export interface Cohort {
  /** Shop-local `YYYY-MM` of the cohort's first visits. */
  monthKey: string;
  /** First-time customers in this month. */
  size: number;
  /** How many came back at all, whenever. */
  returned: number;
  /** How many came back inside the window — the figure the rate is built on. */
  returnedInWindow: number;
  /** How many are on their third visit or beyond. */
  loyal: number;
  /**
   * False while the youngest customer in the cohort is still inside the
   * window. An immature cohort is reported but never rated: at day 10 a real
   * 60% return rate reads as 5%, and a shop would read that as a collapse.
   */
  mature: boolean;
  /** `returnedInWindow / size`, or null while the cohort is immature or too small. */
  rate: number | null;
}

/**
 * Cohorts from finished visits, newest month first.
 *
 * Pure: takes the rows and the clock, no database, no config — same shape as
 * `compartmentRoom()` and `dueJobs()`, and for the same reason. The month
 * boundaries are the shop's, via `shopDayKey()`.
 */
export function cohortsFrom(visits: Visit[], now: Date = new Date(), months = 12): Cohort[] {
  // Every visit a customer has made, oldest first.
  const byCustomer = new Map<string, Date[]>();
  for (const visit of visits) {
    const existing = byCustomer.get(visit.customerId);
    if (existing) existing.push(visit.at);
    else byCustomer.set(visit.customerId, [visit.at]);
  }

  const oldestMonth = monthKey(new Date(now.getTime() - months * 31 * DAY_MS));
  const cohorts = new Map<string, { firsts: Date[]; returned: number; inWindow: number; loyal: number }>();

  for (const dates of byCustomer.values()) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    const key = monthKey(first);
    if (key < oldestMonth) continue;

    const cohort = cohorts.get(key) ?? { firsts: [], returned: 0, inWindow: 0, loyal: 0 };
    cohort.firsts.push(first);
    if (dates.length >= 2) {
      cohort.returned += 1;
      const gapDays = (dates[1].getTime() - first.getTime()) / DAY_MS;
      if (gapDays <= RETURN_WINDOW_DAYS) cohort.inWindow += 1;
    }
    if (dates.length >= 3) cohort.loyal += 1;
    cohorts.set(key, cohort);
  }

  return Array.from(cohorts.entries())
    .map(([monthKey, cohort]) => {
      // The cohort is only judgeable once its LAST first-timer has had the
      // whole window — anyone still inside it has not had their chance yet.
      const youngest = Math.max(...cohort.firsts.map((date) => date.getTime()));
      const mature = now.getTime() - youngest >= RETURN_WINDOW_DAYS * DAY_MS;
      const size = cohort.firsts.length;
      return {
        monthKey,
        size,
        returned: cohort.returned,
        returnedInWindow: cohort.inWindow,
        loyal: cohort.loyal,
        mature,
        rate: mature && size >= MIN_COHORT_SIZE ? cohort.inWindow / size : null,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export interface RetentionSummary {
  cohorts: Cohort[];
  /** Weighted across every mature cohort, or null when there is not enough history. */
  returnRate: number | null;
  /** First-timers behind that rate. */
  ratedCustomers: number;
  /** Of those, how many came back inside the window. */
  ratedReturns: number;
  /** The direction the newest rated cohort moved against the one before it. */
  trend: { latest: Cohort; previous: Cohort; change: number } | null;
}

/** Roll the cohorts up into the one number and the one comparison worth stating. */
export function summarise(cohorts: Cohort[]): RetentionSummary {
  const rated = cohorts.filter((cohort) => cohort.rate != null);
  const ratedCustomers = rated.reduce((sum, cohort) => sum + cohort.size, 0);
  const ratedReturns = rated.reduce((sum, cohort) => sum + cohort.returnedInWindow, 0);

  const [latest, previous] = rated;
  return {
    cohorts,
    returnRate: ratedCustomers === 0 ? null : ratedReturns / ratedCustomers,
    ratedCustomers,
    ratedReturns,
    trend:
      latest && previous
        ? { latest, previous, change: (latest.rate as number) - (previous.rate as number) }
        : null,
  };
}

/** Shop-local `YYYY-MM`. */
function monthKey(date: Date): string {
  return shopDayKey(date).slice(0, 7);
}

/**
 * The shop's cohorts, from finished visits.
 *
 * ponytail: reads every finished visit's two columns rather than windowing the
 * query — a cohort needs a customer's whole history to know it was their
 * first, and a grooming shop's lifetime visit count is thousands, not
 * millions. Window by customer id if that ever stops being true.
 */
export async function retention(months = 12): Promise<RetentionSummary> {
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES } },
    select: { customerId: true, scheduledAt: true },
  });

  return summarise(
    cohortsFrom(
      visits.map((visit) => ({ customerId: visit.customerId, at: visit.scheduledAt })),
      new Date(),
      months
    )
  );
}
