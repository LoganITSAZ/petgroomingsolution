import { prisma } from "@/lib/prisma";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { kennelDemand } from "@/lib/kennels";
import { formatCents } from "@/lib/pricing";
import { formatServiceType, formatShopDate, shopDayRange } from "@/lib/utils";

/**
 * Observations drawn from the shop's own records.
 *
 * Everything here is arithmetic over rows the shop already writes — no
 * predictions dressed up as certainty. Each insight carries the evidence that
 * produced it so staff can judge it, and anything based on too little history
 * is simply not produced.
 */

export type InsightTone = "neutral" | "opportunity" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  /** What to do about it, in a sentence. */
  detail: string;
  /** The numbers behind the claim. */
  evidence: string;
  href?: string;
}

/** Below this many visits, a pattern is noise. */
const MIN_VISITS_FOR_PATTERN = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Customer-level ──────────────────────────────────────────

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

export async function customerRhythm(customerId: string): Promise<CustomerRhythm> {
  const [history, upcoming] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId, status: { in: [...FINISHED_STATUSES, AppointmentStatus.NO_SHOW] } },
      select: {
        scheduledAt: true,
        status: true,
        pricingDiscountCents: true,
        services: { select: { priceCents: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.count({
      where: {
        customerId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
      },
    }),
  ]);

  const finished = history.filter((visit) => visit.status !== AppointmentStatus.NO_SHOW);
  const noShows = history.length - finished.length;

  const gaps: number[] = [];
  for (let i = 1; i < finished.length; i++) {
    const days = Math.round(
      (finished[i].scheduledAt.getTime() - finished[i - 1].scheduledAt.getTime()) / DAY_MS
    );
    if (days > 0) gaps.push(days);
  }

  const cadenceDays = finished.length >= MIN_VISITS_FOR_PATTERN ? median(gaps) : null;
  const lastVisit = finished.length > 0 ? finished[finished.length - 1].scheduledAt : null;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((Date.now() - lastVisit.getTime()) / DAY_MS)
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
      daysSinceLastVisit >= cadenceDays,
    lapsing:
      cadenceDays != null &&
      daysSinceLastVisit != null &&
      upcoming === 0 &&
      daysSinceLastVisit >= cadenceDays * 2,
    noShows,
    noShowRate: history.length === 0 ? 0 : noShows / history.length,
    averageTicketCents:
      tickets.length === 0
        ? null
        : Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length),
  };
}

export async function customerInsights(customerId: string): Promise<Insight[]> {
  const rhythm = await customerRhythm(customerId);
  const insights: Insight[] = [];

  if (rhythm.cadenceDays != null && rhythm.daysSinceLastVisit != null) {
    if (rhythm.lapsing) {
      insights.push({
        id: "lapsing",
        tone: "warning",
        title: "Drifting away",
        detail: "Worth a call — they are well past their usual return.",
        evidence: `Books about every ${rhythm.cadenceDays} days across ${rhythm.visits} visits; last seen ${rhythm.daysSinceLastVisit} days ago with nothing booked.`,
      });
    } else if (rhythm.dueForRebooking) {
      insights.push({
        id: "due",
        tone: "opportunity",
        title: "Due for a groom",
        detail: "Nothing on the books, and they are at their usual interval.",
        evidence: `Books about every ${rhythm.cadenceDays} days; last seen ${rhythm.daysSinceLastVisit} days ago.`,
      });
    }
  }

  if (rhythm.noShows >= 2 && rhythm.noShowRate >= 0.2) {
    insights.push({
      id: "no-show-risk",
      tone: "warning",
      title: "Misses appointments",
      detail: "Worth confirming the day before.",
      evidence: `${rhythm.noShows} no-shows out of ${Math.round(rhythm.noShows / rhythm.noShowRate)} booked visits.`,
    });
  }

  if (rhythm.averageTicketCents != null && rhythm.visits >= MIN_VISITS_FOR_PATTERN) {
    insights.push({
      id: "ticket",
      tone: "neutral",
      title: `Typical ticket ${formatCents(rhythm.averageTicketCents)}`,
      detail: "At the prices this customer was quoted, before size and surcharges.",
      evidence: `Averaged over ${rhythm.visits} finished visits.`,
    });
  }

  return insights;
}

// ─── Pet-level ───────────────────────────────────────────────

export async function petInsights(petId: string): Promise<Insight[]> {
  const [visits, events] = await Promise.all([
    prisma.appointment.findMany({
      where: { petId, status: { in: FINISHED_STATUSES }, checkedInAt: { not: null } },
      select: { checkedInAt: true, completedAt: true, durationMins: true, updatedAt: true },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
    prisma.visitEvent.groupBy({
      by: ["eventType"],
      where: { appointment: { petId } },
      _count: { _all: true },
    }),
  ]);

  const insights: Insight[] = [];

  const overruns = visits
    .filter((visit) => visit.durationMins != null && visit.checkedInAt)
    .map((visit) => {
      const finishedAt = visit.completedAt ?? visit.updatedAt;
      const actual = Math.round((finishedAt.getTime() - visit.checkedInAt!.getTime()) / 60000);
      return actual - (visit.durationMins as number);
    })
    .filter((difference) => Number.isFinite(difference));

  if (overruns.length >= MIN_VISITS_FOR_PATTERN) {
    const typical = median(overruns) ?? 0;
    if (typical >= 15) {
      insights.push({
        id: "runs-long",
        tone: "warning",
        title: `Usually runs ${typical} min over`,
        detail: "Book extra time, or the day behind it slips.",
        evidence: `Across the last ${overruns.length} visits with a booked duration.`,
      });
    } else if (typical <= -15) {
      insights.push({
        id: "runs-short",
        tone: "opportunity",
        title: `Usually finishes ${Math.abs(typical)} min early`,
        detail: "The slot could be shorter, freeing time later in the day.",
        evidence: `Across the last ${overruns.length} visits with a booked duration.`,
      });
    }
  }

  const repeated = events.filter((event) => event._count._all >= 2);
  for (const event of repeated) {
    insights.push({
      id: `repeat-${event.eventType}`,
      tone: event.eventType === "BITE" ? "warning" : "neutral",
      title: `${formatServiceType(event.eventType)} logged ${event._count._all} times`,
      detail: "A pattern, not a one-off — brief whoever takes this pet.",
      evidence: "From this pet's visit event log.",
    });
  }

  return insights;
}

// ─── Shop-level ──────────────────────────────────────────────

/** Services most often booked alongside a given one. */
export async function serviceAttachments(): Promise<
  { serviceType: string; partner: string; together: number; share: number }[]
> {
  const visits = await prisma.appointment.findMany({
    where: { services: { some: {} } },
    select: { services: { select: { serviceType: true } } },
    take: 2000,
    orderBy: { scheduledAt: "desc" },
  });

  const totals = new Map<string, number>();
  const pairs = new Map<string, number>();

  for (const visit of visits) {
    const types = Array.from(new Set(visit.services.map((line) => line.serviceType)));
    for (const type of types) totals.set(type, (totals.get(type) ?? 0) + 1);
    for (const a of types) {
      for (const b of types) {
        if (a === b) continue;
        const key = `${a}|${b}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }

  const best = new Map<string, { partner: string; together: number }>();
  for (const [key, together] of pairs) {
    const [type, partner] = key.split("|");
    const current = best.get(type);
    if (!current || together > current.together) best.set(type, { partner, together });
  }

  return Array.from(best.entries())
    .map(([serviceType, { partner, together }]) => ({
      serviceType,
      partner,
      together,
      share: together / (totals.get(serviceType) ?? 1),
    }))
    .filter((row) => row.together >= MIN_VISITS_FOR_PATTERN && row.share >= 0.25)
    .sort((a, b) => b.share - a.share);
}

/** The hours the shop is actually busiest, in shop time. */
export async function peakHours(days = 60): Promise<{ hour: number; visits: number }[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  const visits = await prisma.appointment.findMany({
    where: { scheduledAt: { gte: since } },
    select: { scheduledAt: true },
  });

  const byHour = new Map<number, number>();
  for (const visit of visits) {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Phoenix",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(visit.scheduledAt)
    );
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }

  return Array.from(byHour.entries())
    .map(([hour, count]) => ({ hour, visits: count }))
    .sort((a, b) => b.visits - a.visits);
}

/** Kennel pressure over the coming week. */
export async function kennelForecast(
  daysAhead = 7
): Promise<{ day: Date; committed: number; capacity: number; tight: boolean }[]> {
  const out: { day: Date; committed: number; capacity: number; tight: boolean }[] = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const { start, end } = shopDayRange(new Date(Date.now() + offset * DAY_MS));
    const demand = await kennelDemand(start, end);
    const committed = demand.occupied + demand.reserved;
    out.push({
      day: start,
      committed,
      capacity: demand.capacity,
      tight: demand.capacity > 0 && committed >= demand.capacity * 0.9,
    });
  }

  return out;
}

export async function shopInsights(): Promise<Insight[]> {
  const { start, end } = shopDayRange();
  const insights: Insight[] = [];

  const [dueCustomers, noShowRisk, forecast, attachments, hours, walkInShare] = await Promise.all([
    // Customers with history but nothing booked, ordered by how overdue.
    prisma.customer.findMany({
      where: {
        isActive: true,
        appointments: { none: { status: AppointmentStatus.SCHEDULED, scheduledAt: { gte: new Date() } } },
      },
      select: { id: true, firstName: true, lastName: true },
      take: 200,
    }),
    prisma.appointment.findMany({
      where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { gte: start, lt: end } },
      select: { id: true, customerId: true, pet: { select: { name: true } } },
    }),
    kennelForecast(7),
    serviceAttachments(),
    peakHours(),
    prisma.appointment.groupBy({
      by: ["appointmentType"],
      where: { scheduledAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      _count: { _all: true },
    }),
  ]);

  // Who is overdue, checked against each customer's own rhythm.
  const due: string[] = [];
  for (const customer of dueCustomers.slice(0, 60)) {
    const rhythm = await customerRhythm(customer.id);
    if (rhythm.dueForRebooking) due.push(`${customer.firstName} ${customer.lastName}`);
  }
  if (due.length > 0) {
    insights.push({
      id: "rebooking",
      tone: "opportunity",
      title: `${due.length} customer${due.length === 1 ? " is" : "s are"} due to rebook`,
      detail: "Each is past their own usual interval with nothing on the books.",
      evidence: due.slice(0, 5).join(", ") + (due.length > 5 ? `, +${due.length - 5} more` : ""),
      href: "/staff/customers",
    });
  }

  // Today's bookings from people who have missed before.
  const risky: string[] = [];
  for (const appointment of noShowRisk) {
    const rhythm = await customerRhythm(appointment.customerId);
    if (rhythm.noShows >= 2 && rhythm.noShowRate >= 0.2) risky.push(appointment.pet.name);
  }
  if (risky.length > 0) {
    insights.push({
      id: "no-show-today",
      tone: "warning",
      title: `${risky.length} booking${risky.length === 1 ? "" : "s"} today from customers who have missed before`,
      detail: "A confirmation call costs less than the empty slot.",
      evidence: risky.slice(0, 5).join(", "),
      href: "/staff/appointments",
    });
  }

  const tightDays = forecast.filter((day) => day.tight);
  if (tightDays.length > 0) {
    insights.push({
      id: "kennel-pressure",
      tone: "warning",
      title: `Kennels tight on ${tightDays.length} of the next 7 days`,
      detail: "Leave room, or the next walk-in has nowhere to go.",
      evidence: tightDays
        .map((day) => `${formatShopDate(day.day, { weekday: "short" })} ${day.committed}/${day.capacity}`)
        .join(", "),
      href: "/staff/stations",
    });
  }

  const topAttachment = attachments[0];
  if (topAttachment) {
    insights.push({
      id: "attach",
      tone: "opportunity",
      title: `${formatServiceType(topAttachment.serviceType)} usually comes with ${formatServiceType(topAttachment.partner)}`,
      detail: "Worth offering when it is not already on the ticket.",
      evidence: `${Math.round(topAttachment.share * 100)}% of those visits (${topAttachment.together} of them) included both.`,
      href: "/staff/services",
    });
  }

  if (hours.length >= 2) {
    const busiest = hours[0];
    const quietest = hours[hours.length - 1];
    insights.push({
      id: "peak",
      tone: "neutral",
      title: `Busiest around ${busiest.hour}:00`,
      detail: "Where the day's pressure lands — staff and stations follow it.",
      evidence: `${busiest.visits} visits booked at ${busiest.hour}:00 over 60 days, against ${quietest.visits} at ${quietest.hour}:00.`,
      href: "/staff/analytics",
    });
  }

  const walkIns = walkInShare.find((row) => row.appointmentType === AppointmentType.WALK_IN);
  const booked = walkInShare.find((row) => row.appointmentType === AppointmentType.APPOINTMENT);
  const totalVisits = (walkIns?._count._all ?? 0) + (booked?._count._all ?? 0);
  if (totalVisits >= 10 && walkIns) {
    const share = walkIns._count._all / totalVisits;
    if (share >= 0.25) {
      insights.push({
        id: "walk-in-share",
        tone: "neutral",
        title: `${Math.round(share * 100)}% of visits arrive as walk-ins`,
        detail: "Hold capacity back rather than booking the day solid.",
        evidence: `${walkIns._count._all} walk-ins of ${totalVisits} visits in the last 30 days.`,
      });
    }
  }

  return insights;
}
