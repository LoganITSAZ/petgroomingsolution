import { AppointmentStatus } from "@prisma/client";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

/**
 * How often a household comes in, and whether they are late.
 *
 * Its own module because two things need it and they need each other: the
 * insights read a customer's rhythm, and the demand forecast reads every
 * customer's rhythm to say what next Tuesday looks like — which the rota
 * advice then reads. With this living in `lib/insights.ts` that was an import
 * cycle, and a cycle in a bundler is a binding that is undefined on whichever
 * side happens to evaluate first.
 */

/** Below this many visits, a pattern is noise. */
export const MIN_VISITS_FOR_PATTERN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The middle value, rounded. Used for gaps between visits, never for money. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export interface CustomerRhythm {
  visits: number;
  /** Typical days between visits, once there are enough of them. */
  cadenceDays: number | null;
  lastVisit: Date | null;
  daysSinceLastVisit: number | null;
  hasUpcoming: boolean;
  /** Past due for their usual rebooking. */
  dueForRebooking: boolean;
  /** Well past it — drifting away. */
  lapsing: boolean;
  noShows: number;
  noShowRate: number;
  averageTicketCents: number | null;
}

/** One finished-or-missed visit, as the rhythm arithmetic needs it. */
export interface RhythmVisit {
  scheduledAt: Date;
  status: AppointmentStatus;
  pricingDiscountCents: number | null;
  services: { priceCents: number | null }[];
}

/**
 * A customer's rhythm from their own history.
 *
 * Pure, so the batch below and the single lookup cannot drift apart, and so
 * the cadence arithmetic is testable without a database.
 *
 * `graceDays` is the shop's own `rebookingGraceDays`, so a profile and the
 * "Due to rebook" list on the appointments board name the same households —
 * a customer flagged here but absent from the call list for another week is
 * two answers to one question.
 */
export function rhythmFrom(
  history: RhythmVisit[],
  upcoming: number,
  graceDays = 0,
  now: Date = new Date()
): CustomerRhythm {
  const ordered = [...history].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const finished = ordered.filter((visit) => visit.status !== AppointmentStatus.NO_SHOW);
  const noShows = ordered.length - finished.length;

  const gaps: number[] = [];
  for (let i = 1; i < finished.length; i++) {
    const days = Math.round(
      (finished[i].scheduledAt.getTime() - finished[i - 1].scheduledAt.getTime()) / DAY_MS
    );
    if (days > 0) gaps.push(days);
  }

  const cadenceDays = finished.length >= MIN_VISITS_FOR_PATTERN ? median(gaps) : null;
  const grace = Math.max(0, Math.floor(graceDays));
  const lastVisit = finished.length > 0 ? finished[finished.length - 1].scheduledAt : null;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((now.getTime() - lastVisit.getTime()) / DAY_MS)
    : null;

  // Net of whatever rate this customer was quoted under, otherwise the typical
  // ticket shown on a legacy customer's page is a price they have never paid.
  const tickets = finished
    .map((visit) => {
      const list = visit.services.reduce<number | null>(
        (sum, line) => (line.priceCents == null ? sum : (sum ?? 0) + line.priceCents),
        null
      );
      return list == null ? null : Math.max(0, list - (visit.pricingDiscountCents ?? 0));
    })
    .filter((cents): cents is number => cents != null);

  return {
    visits: finished.length,
    cadenceDays,
    lastVisit,
    daysSinceLastVisit,
    hasUpcoming: upcoming > 0,
    dueForRebooking:
      cadenceDays != null &&
      daysSinceLastVisit != null &&
      upcoming === 0 &&
      daysSinceLastVisit >= cadenceDays + grace,
    lapsing:
      cadenceDays != null &&
      daysSinceLastVisit != null &&
      upcoming === 0 &&
      daysSinceLastVisit >= cadenceDays * 2 + grace,
    noShows,
    noShowRate: ordered.length === 0 ? 0 : noShows / ordered.length,
    averageTicketCents:
      tickets.length === 0
        ? null
        : Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length),
  };
}

const RHYTHM_SELECT = {
  customerId: true,
  scheduledAt: true,
  status: true,
  pricingDiscountCents: true,
  services: { select: { priceCents: true } },
} as const;

const RHYTHM_STATUSES = [...FINISHED_STATUSES, AppointmentStatus.NO_SHOW];

/**
 * Rhythms for many customers in two queries rather than two per customer.
 *
 * The shop-wide insights below ask this of every household with history. Asked
 * one at a time that was well over a hundred round trips before the dashboard
 * could paint, and it grew with the customer list.
 */
export async function rhythmsFor(
  customerIds: string[],
  graceDays = 0,
  now: Date = new Date()
): Promise<Map<string, CustomerRhythm>> {
  const rhythms = new Map<string, CustomerRhythm>();
  if (customerIds.length === 0) return rhythms;

  const [history, upcoming] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId: { in: customerIds }, status: { in: RHYTHM_STATUSES } },
      select: RHYTHM_SELECT,
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { gte: now },
      },
      _count: { _all: true },
    }),
  ]);

  const byCustomer = new Map<string, RhythmVisit[]>();
  for (const visit of history) {
    const existing = byCustomer.get(visit.customerId);
    if (existing) existing.push(visit);
    else byCustomer.set(visit.customerId, [visit]);
  }
  const upcomingByCustomer = new Map(upcoming.map((row) => [row.customerId, row._count._all]));

  for (const customerId of customerIds) {
    rhythms.set(
      customerId,
      rhythmFrom(
        byCustomer.get(customerId) ?? [],
        upcomingByCustomer.get(customerId) ?? 0,
        graceDays,
        now
      )
    );
  }
  return rhythms;
}

export async function customerRhythm(customerId: string, graceDays = 0): Promise<CustomerRhythm> {
  const rhythms = await rhythmsFor([customerId], graceDays);
  return rhythms.get(customerId) as CustomerRhythm;
}
