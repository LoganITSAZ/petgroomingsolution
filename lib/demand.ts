import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { rhythmsFor } from "@/lib/rhythm";
import { shopDayKey, shopDayRange } from "@/lib/utils";

/**
 * What the shop is likely to be asked for, not only what it has been asked for.
 *
 * `peakHours()` says where pressure landed last month and `scheduleAdvice()`
 * staffs against the diary — both look at bookings that already exist. Neither
 * sees the twelve households whose own habit says they are due next Tuesday and
 * who simply have not rung yet. A rota built on the diary alone is always
 * staffed for the quietest version of the week.
 *
 * Every figure here is an estimate and is labelled one. A customer's cadence
 * says when they usually come back, never that they will.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead there is any point looking. Beyond a fortnight the rota is not written. */
export const FORECAST_DAYS = 14;

export interface DemandDay {
  dayKey: string;
  day: Date;
  /** Visits actually on the books. */
  booked: number;
  /** Households whose own gap between grooms lands on this day with nothing booked. */
  expected: number;
  /** The two together — what to staff against. */
  likely: number;
}

export interface Prediction {
  /** Shop-local day the customer's own cadence points at. */
  dayKey: string;
}

/**
 * The forecast, from a day list, the diary and the predictions.
 *
 * Pure, so the arithmetic is testable and the two callers — the rota advice and
 * the shop insight — cannot disagree about a Tuesday.
 */
export function forecastFrom(
  days: Date[],
  bookedByDay: Map<string, number>,
  predictions: Prediction[]
): DemandDay[] {
  const expectedByDay = new Map<string, number>();
  for (const prediction of predictions) {
    expectedByDay.set(prediction.dayKey, (expectedByDay.get(prediction.dayKey) ?? 0) + 1);
  }

  return days.map((day) => {
    const dayKey = shopDayKey(day);
    const booked = bookedByDay.get(dayKey) ?? 0;
    const expected = expectedByDay.get(dayKey) ?? 0;
    return { dayKey, day, booked, expected, likely: booked + expected };
  });
}

/**
 * When each household is next due, by their own habit.
 *
 * Customers already past their date are deliberately absent: they could ring
 * any day, which is not a forecast for a particular one, and the rebooking call
 * list is the screen that exists for them. This is only the households whose
 * turn is still ahead.
 */
export function predictionsFrom(
  rhythms: Map<string, { cadenceDays: number | null; lastVisit: Date | null; hasUpcoming: boolean }>,
  horizonDays: number,
  now: Date
): Prediction[] {
  const predictions: Prediction[] = [];
  const horizon = now.getTime() + horizonDays * DAY_MS;

  for (const rhythm of rhythms.values()) {
    if (rhythm.hasUpcoming) continue; // Already in the diary, already counted as booked.
    if (rhythm.cadenceDays == null || rhythm.lastVisit == null) continue;
    const due = rhythm.lastVisit.getTime() + rhythm.cadenceDays * DAY_MS;
    if (due < now.getTime() || due > horizon) continue;
    predictions.push({ dayKey: shopDayKey(new Date(due)) });
  }
  return predictions;
}

/** The next `days` shop days, starting today. */
function upcomingDays(days: number, now: Date): Date[] {
  const { start } = shopDayRange(now);
  return Array.from({ length: days }, (_, offset) => new Date(start.getTime() + offset * DAY_MS));
}

/**
 * Households due back, keyed by the shop day their habit points at.
 *
 * ponytail: reads every active customer's history to get their cadence, which
 * is two queries but wide ones. A grooming shop's customer list is hundreds,
 * so this is cheaper than the round-trip-per-household it replaced. Cache it
 * behind the job runner if the list ever runs to five figures.
 */
export async function expectedReturnsByDay(
  days: Date[],
  now: Date = new Date()
): Promise<Map<string, number>> {
  if (days.length === 0) return new Map();
  const config = await getConfig();

  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const rhythms = await rhythmsFor(
    customers.map((customer) => customer.id),
    config.rebookingGraceDays,
    now
  );

  const horizonDays = Math.ceil((days[days.length - 1].getTime() + DAY_MS - now.getTime()) / DAY_MS);
  const counts = new Map<string, number>();
  for (const prediction of predictionsFrom(rhythms, horizonDays, now)) {
    counts.set(prediction.dayKey, (counts.get(prediction.dayKey) ?? 0) + 1);
  }
  return counts;
}

/** Booked plus expected, day by day, for the fortnight ahead. */
export async function demandForecast(
  days = FORECAST_DAYS,
  now: Date = new Date()
): Promise<DemandDay[]> {
  const dayList = upcomingDays(days, now);
  const windowEnd = new Date(dayList[dayList.length - 1].getTime() + DAY_MS);

  const [booked, expected] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { gte: dayList[0], lt: windowEnd },
      },
      select: { scheduledAt: true },
    }),
    expectedReturnsByDay(dayList, now),
  ]);

  const bookedByDay = new Map<string, number>();
  for (const visit of booked) {
    const key = shopDayKey(visit.scheduledAt);
    bookedByDay.set(key, (bookedByDay.get(key) ?? 0) + 1);
  }

  // forecastFrom takes predictions rather than a count map, so rebuild the flat
  // list from the counts — one shape of truth for both callers.
  const predictions: Prediction[] = [];
  for (const [dayKey, count] of expected) {
    for (let i = 0; i < count; i++) predictions.push({ dayKey });
  }

  return forecastFrom(dayList, bookedByDay, predictions);
}
