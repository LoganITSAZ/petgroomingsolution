import { AppointmentStatus, NotificationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { shopDayKey } from "@/lib/utils";

/**
 * Who has not come back.
 *
 * `customerRhythm()` in lib/insights.ts has measured a household's usual gap
 * between grooms since it was written, and shows it one customer at a time.
 * This is the same arithmetic pointed at the whole book: the median gap, the
 * household's own normal, and how far past it they are.
 *
 * Decisions are pure; the queries are at the bottom. Nothing here guesses --
 * a customer with too little history produces nothing at all rather than a
 * cadence drawn from two visits.
 */

/** Below this many finished visits, a cadence is noise. Matches lib/insights.ts. */
export const MIN_VISITS_FOR_CADENCE = 3;

export interface RebookingHistory {
  customerId: string;
  /** Finished visits, oldest first. */
  visits: { id: string; at: Date }[];
  /** Anything on the books ahead. */
  hasUpcoming: boolean;
  /** Whether a prompt has already gone out for the latest visit. */
  prompted: boolean;
}

export interface RebookingDue {
  customerId: string;
  /** Typical days between grooms, the median of their own gaps. */
  cadenceDays: number;
  visits: number;
  /** The visit the prompt is anchored on: their most recent one. */
  lastVisitId: string;
  lastVisitAt: Date;
  daysSince: number;
  /** How far past their own cadence they are, in days. */
  daysOverdue: number;
  /** Twice their cadence -- drifting away rather than running late. */
  lapsing: boolean;
  prompted: boolean;
}

/** Shop-local calendar days between two instants. Same rule as lib/vaccinations.ts. */
function dayDiff(from: Date, to: Date): number {
  const asDay = (at: Date) => {
    const [year, month, day] = shopDayKey(at).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asDay(to) - asDay(from)) / 86_400_000);
}

/**
 * The median gap, not the mean: one groom skipped over a holiday must not move
 * a customer's normal. Null until there is enough history to have one.
 */
export function cadenceDays(visits: { at: Date }[]): number | null {
  if (visits.length < MIN_VISITS_FOR_CADENCE) return null;

  const gaps: number[] = [];
  for (let i = 1; i < visits.length; i++) {
    const days = dayDiff(visits[i - 1].at, visits[i].at);
    if (days > 0) gaps.push(days);
  }
  if (gaps.length === 0) return null;

  const sorted = gaps.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * Which households are past their own cadence with nothing booked.
 *
 * An already-prompted customer stays in the list -- the counter still wants to
 * ring them -- and carries `prompted` so the job knows to leave them alone.
 * Worst first: lapsing, then furthest past their cadence.
 */
export function rebookingDue(
  history: RebookingHistory[],
  options: { graceDays: number },
  now: Date = new Date()
): RebookingDue[] {
  const grace = Math.max(0, Math.floor(options.graceDays));

  const due: RebookingDue[] = [];
  for (const row of history) {
    if (row.hasUpcoming) continue;

    const cadence = cadenceDays(row.visits);
    if (cadence == null) continue;

    const last = row.visits[row.visits.length - 1];
    const daysSince = dayDiff(last.at, now);
    if (daysSince < cadence + grace) continue;

    due.push({
      customerId: row.customerId,
      cadenceDays: cadence,
      visits: row.visits.length,
      lastVisitId: last.id,
      lastVisitAt: last.at,
      daysSince,
      daysOverdue: daysSince - cadence,
      lapsing: daysSince >= cadence * 2,
      prompted: row.prompted,
    });
  }

  return due.sort(
    (a, b) => Number(b.lapsing) - Number(a.lapsing) || b.daysOverdue - a.daysOverdue
  );
}

/** The numbers behind the claim, the `evidence` rule from lib/insights.ts. */
export function rebookingEvidence(row: RebookingDue): string {
  return `Books about every ${row.cadenceDays} days across ${row.visits} visits; last seen ${row.daysSince} days ago with nothing booked.`;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * The call list, worst first.
 *
 * One query over appointments -- finished and scheduled together, grouped per
 * customer in memory. This is a page the counter opens, not a per-row lookup.
 */
export async function rebookingList(
  config: { featureRebookingPrompts: boolean; rebookingGraceDays: number },
  now: Date = new Date()
): Promise<(RebookingDue & { customer: RebookingCustomer })[]> {
  if (!config.featureRebookingPrompts) return [];

  const visits = await prisma.appointment.findMany({
    where: {
      status: { in: [...FINISHED_STATUSES, AppointmentStatus.SCHEDULED] },
    },
    select: {
      id: true,
      customerId: true,
      scheduledAt: true,
      status: true,
      notifications: {
        where: { kind: NotificationKind.REBOOKING_PROMPT },
        select: { id: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const byCustomer = new Map<string, RebookingHistory>();
  for (const visit of visits) {
    let row = byCustomer.get(visit.customerId);
    if (!row) {
      row = { customerId: visit.customerId, visits: [], hasUpcoming: false, prompted: false };
      byCustomer.set(visit.customerId, row);
    }
    if (visit.status === AppointmentStatus.SCHEDULED) {
      // Only ahead of now: a scheduled visit left in the past was never
      // marked either way, and it is not a booking anybody is waiting for.
      if (visit.scheduledAt > now) row.hasUpcoming = true;
      continue;
    }
    row.visits.push({ id: visit.id, at: visit.scheduledAt });
    // The visits arrive oldest first, so the last one to set this is the
    // anchor -- exactly the visit a prompt would be claimed against.
    row.prompted = visit.notifications.length > 0;
  }

  const due = rebookingDue(
    [...byCustomer.values()],
    { graceDays: config.rebookingGraceDays },
    now
  );
  if (due.length === 0) return [];

  const customers = await customersFor(due.map((row) => row.customerId));
  return due.flatMap((row) => {
    const customer = customers.get(row.customerId);
    return customer ? [{ ...row, customer }] : [];
  });
}

export interface RebookingCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  smsOptOut: boolean;
  pets: { id: string; name: string }[];
}

async function customersFor(ids: string[]): Promise<Map<string, RebookingCustomer>> {
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      smsOptOut: true,
      pets: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  return new Map(customers.map((customer) => [customer.id, customer]));
}
