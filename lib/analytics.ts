import { prisma } from "@/lib/prisma";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { isFloorStaff, shopDayKey, shopDayRange } from "@/lib/utils";
import { serviceFloorCents } from "@/lib/pricing";

/**
 * Everything here is derived from rows the shop already writes — appointments
 * and their status history. Nothing is estimated except revenue, which is
 * explicitly the published list price and is labelled as such wherever shown.
 */

/** A visit counts as finished once the groom is done, however it was closed out. */
export const FINISHED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETE,
  AppointmentStatus.READY_PICKUP,
  AppointmentStatus.PICKED_UP,
];

export interface CompletionRecord {
  appointmentId: string;
  staffId: string | null;
  finishedAt: Date;
  dayKey: string;
  turnaroundMins: number | null;
  priceCents: number | null;
  /** What an agreed rate took off this visit. Pay is on the list price above. */
  discountCents: number;
  serviceTypes: string[];
}

/**
 * Finished visits with the groomer credited, when they finished, how long the
 * pet was in the shop, and the list price of the services booked.
 *
 * Credit goes to the assigned groomer; when nobody was assigned it falls back
 * to whoever moved the appointment into a finished state.
 */
export async function getCompletions(since?: Date): Promise<CompletionRecord[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: FINISHED_STATUSES },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      services: { include: { service: true } },
      statusHistory: {
        where: { status: { in: FINISHED_STATUSES } },
        orderBy: { changedAt: "asc" },
        take: 1,
      },
    },
  });

  return appointments.map((appointment) => {
    const firstFinish = appointment.statusHistory[0] ?? null;
    const finishedAt = appointment.completedAt ?? firstFinish?.changedAt ?? appointment.updatedAt;
    const staffId = appointment.staffId ?? firstFinish?.changedById ?? null;

    const turnaroundMins =
      appointment.checkedInAt && finishedAt > appointment.checkedInAt
        ? Math.round((finishedAt.getTime() - appointment.checkedInAt.getTime()) / 60000)
        : null;

    const priceCents = appointment.services.reduce<number | null>((sum, line) => {
      const cents = line.priceCents ?? (line.service ? serviceFloorCents(line.service) : null);
      if (cents == null) return sum;
      return (sum ?? 0) + cents;
    }, null);

    return {
      appointmentId: appointment.id,
      staffId,
      finishedAt,
      dayKey: shopDayKey(finishedAt),
      turnaroundMins,
      priceCents,
      discountCents: appointment.pricingDiscountCents ?? 0,
      serviceTypes: appointment.services.map((line) => line.serviceType),
    };
  });
}

export interface Badge {
  key: string;
  label: string;
  detail: string;
}

/** Milestones a groomer can reach. Thresholds are lifetime finished visits. */
const COMPLETION_BADGES: { threshold: number; label: string }[] = [
  { threshold: 10, label: "First Ten" },
  { threshold: 50, label: "Fifty Club" },
  { threshold: 100, label: "Century Club" },
  { threshold: 250, label: "250 Club" },
  { threshold: 500, label: "Master Groomer" },
];

function badgesFor(stats: {
  lifetime: number;
  bestDay: number;
  streak: number;
}): Badge[] {
  const badges: Badge[] = [];

  for (const { threshold, label } of COMPLETION_BADGES) {
    if (stats.lifetime >= threshold) {
      badges.push({ key: `lifetime-${threshold}`, label, detail: `${threshold}+ finished visits` });
    }
  }
  if (stats.bestDay >= 6) {
    badges.push({ key: "power-day", label: "Power Day", detail: `${stats.bestDay} in one day` });
  }
  if (stats.streak >= 3) {
    badges.push({
      key: "on-a-roll",
      label: stats.streak >= 7 ? "Perfect Week" : "On a Roll",
      detail: `${stats.streak} shop days in a row`,
    });
  }
  return badges;
}

/**
 * Consecutive shop days, counting back from the most recent day the groomer
 * finished anything. A day the shop was closed for them simply ends the run.
 */
function currentStreak(dayKeys: Set<string>, today: string): number {
  if (dayKeys.size === 0) return 0;

  const cursor = new Date(`${today}T12:00:00Z`);
  // A streak may legitimately end yesterday if today's work has not landed yet.
  if (!dayKeys.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  for (let guard = 0; guard < 400; guard++) {
    const key = cursor.toISOString().slice(0, 10);
    if (!dayKeys.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export interface LeaderboardRow {
  roles: string[];
  commissionPercent: number;
  payTodayCents: number;
  payWeekCents: number;
  payMonthCents: number;
  /** Tips on visits this person finished. Beside commission, never inside it. */
  tipWeekCents: number;
  tipMonthCents: number;
  staffId: string;
  name: string;
  isActive: boolean;
  today: number;
  week: number;
  month: number;
  lifetime: number;
  bestDay: number;
  streak: number;
  avgTurnaroundMins: number | null;
  badges: Badge[];
}

export interface ShopAnalytics {
  rangeDays: number;
  booked: number;
  finished: number;
  cancelled: number;
  noShows: number;
  walkIns: number;
  scheduledAppointments: number;
  noShowRate: number;
  avgTurnaroundMins: number | null;
  estimatedRevenueCents: number;
  /** What agreed rates took off, so the list-price figure is recoverable. */
  rateDiscountCents: number;
  /** What the shop's terminal actually took in the range, tips included. */
  takenCents: number;
  tipsCents: number;
  pricedShare: number;
  perDay: { dayKey: string; finished: number }[];
  serviceMix: { serviceType: string; count: number }[];
  newCustomers: number;
  returningShare: number;
}

export async function getShopAnalytics(rangeDays = 30): Promise<ShopAnalytics> {
  const { end: todayEnd } = shopDayRange();
  const rangeStart = new Date(todayEnd.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const [appointments, completions, newCustomers, serviceMix, taken] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: rangeStart, lt: todayEnd } },
      select: { id: true, status: true, appointmentType: true, customerId: true },
    }),
    getCompletions(rangeStart),
    prisma.customer.count({ where: { createdAt: { gte: rangeStart } } }),
    prisma.appointmentService.groupBy({
      by: ["serviceType"],
      _count: { _all: true },
      where: { appointment: { scheduledAt: { gte: rangeStart, lt: todayEnd } } },
      orderBy: { _count: { serviceType: "desc" } },
      take: 8,
    }),
    // Taken, not estimated: the only figure on this screen that is a fact
    // rather than a floor derived from list prices.
    prisma.payment.aggregate({
      where: { takenAt: { gte: rangeStart, lt: todayEnd } },
      _sum: { amountCents: true, tipCents: true },
    }),
  ]);

  const inRange = completions.filter((c) => c.finishedAt >= rangeStart);
  const turnarounds = inRange
    .map((c) => c.turnaroundMins)
    .filter((mins): mins is number => mins != null);

  // Revenue is net of the rates the shop agreed; commission below stays on the
  // list price, which is what the groomer's pay was always calculated from.
  const priced = inRange.filter((c) => c.priceCents != null);
  const estimatedRevenueCents = priced.reduce(
    (sum, c) => sum + Math.max(0, (c.priceCents ?? 0) - c.discountCents),
    0
  );
  const rateDiscountCents = priced.reduce((sum, c) => sum + c.discountCents, 0);
  const takenCents = taken._sum.amountCents ?? 0;
  const tipsCents = taken._sum.tipCents ?? 0;

  const perDayMap = new Map<string, number>();
  for (const completion of inRange) {
    perDayMap.set(completion.dayKey, (perDayMap.get(completion.dayKey) ?? 0) + 1);
  }
  const perDay = Array.from(perDayMap.entries())
    .map(([dayKey, finished]) => ({ dayKey, finished }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const cancelled = appointments.filter((a) => a.status === AppointmentStatus.CANCELLED).length;
  const noShows = appointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length;
  const walkIns = appointments.filter((a) => a.appointmentType === AppointmentType.WALK_IN).length;
  const settled = appointments.filter((a) =>
    [...FINISHED_STATUSES, AppointmentStatus.NO_SHOW].includes(a.status)
  ).length;

  const customerVisits = new Map<string, number>();
  for (const appointment of appointments) {
    customerVisits.set(appointment.customerId, (customerVisits.get(appointment.customerId) ?? 0) + 1);
  }
  const repeatCustomers = Array.from(customerVisits.values()).filter((n) => n > 1).length;

  return {
    rangeDays,
    booked: appointments.length,
    finished: inRange.length,
    cancelled,
    noShows,
    walkIns,
    scheduledAppointments: appointments.length - walkIns,
    noShowRate: settled === 0 ? 0 : noShows / settled,
    avgTurnaroundMins:
      turnarounds.length === 0
        ? null
        : Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length),
    estimatedRevenueCents,
    rateDiscountCents,
    takenCents,
    tipsCents,
    pricedShare: inRange.length === 0 ? 0 : priced.length / inRange.length,
    perDay,
    serviceMix: serviceMix.map((row) => ({
      serviceType: row.serviceType,
      count: row._count._all,
    })),
    newCustomers,
    returningShare: customerVisits.size === 0 ? 0 : repeatCustomers / customerVisits.size,
  };
}

/** How far back the detailed leaderboard figures look. */
export const LEADERBOARD_WINDOW_DAYS = 90;

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const { start: todayStart, end: todayEnd } = shopDayRange();
  const weekStart = new Date(todayEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(todayEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayKey = shopDayKey(todayStart);

  // Detail is loaded for a window; lifetime totals come from a count query, so
  // the page does not drag every appointment ever finished into memory.
  const windowStart = new Date(
    todayEnd.getTime() - LEADERBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [staff, completions, config, lifetimeCounts, tipPayments] = await Promise.all([
    prisma.staff.findMany({
      select: { id: true, name: true, roles: true, isActive: true, commissionPercent: true },
      orderBy: { name: "asc" },
    }),
    getCompletions(windowStart),
    prisma.systemConfig.findUnique({ where: { id: "global" } }),
    prisma.appointment.groupBy({
      by: ["staffId"],
      where: { status: { in: FINISHED_STATUSES }, staffId: { not: null } },
      _count: { _all: true },
    }),
    // A tip belongs to whoever finished the pet, not to whoever stood at the
    // counter, so it is grouped by the visit's groomer. Prisma cannot group by
    // a relation's column, and a month of payments is a small list.
    prisma.payment.findMany({
      where: { takenAt: { gte: monthStart, lt: todayEnd }, tipCents: { gt: 0 } },
      select: { tipCents: true, takenAt: true, appointment: { select: { staffId: true } } },
    }),
  ]);

  const lifetimeByStaff = new Map(
    lifetimeCounts.map((row) => [row.staffId as string, row._count._all])
  );

  const defaultCommission = config?.defaultCommissionPercent ?? 40;

  const tipsFor = (staffId: string, from: Date) =>
    tipPayments
      .filter((payment) => payment.appointment.staffId === staffId && payment.takenAt >= from)
      .reduce((sum, payment) => sum + payment.tipCents, 0);

  return staff
    // Admin-only accounts never hold a pet, so they have nothing to rank.
    .filter((member) => isFloorStaff(member.roles))
    .map((member) => {
      const mine = completions.filter((c) => c.staffId === member.id);
      const dayCounts = new Map<string, number>();
      for (const completion of mine) {
        dayCounts.set(completion.dayKey, (dayCounts.get(completion.dayKey) ?? 0) + 1);
      }

      const turnarounds = mine
        .map((c) => c.turnaroundMins)
        .filter((mins): mins is number => mins != null);

      // Estimated pay: commission on the list price of everything they
      // finished. Tickets vary with pet size and surcharges, so this is a
      // floor, never a payroll figure.
      const commissionPercent = member.commissionPercent ?? defaultCommission;
      const payFor = (from: Date, to?: Date) =>
        Math.round(
          mine
            .filter((c) => c.finishedAt >= from && (to ? c.finishedAt < to : true))
            .reduce((sum, c) => sum + (c.priceCents ?? 0), 0) *
            (commissionPercent / 100)
        );

      const stats = {
        lifetime: lifetimeByStaff.get(member.id) ?? 0,
        bestDay: dayCounts.size === 0 ? 0 : Math.max(...dayCounts.values()),
        streak: currentStreak(new Set(dayCounts.keys()), todayKey),
      };

      return {
        staffId: member.id,
        name: member.name,
        roles: member.roles,
        isActive: member.isActive,
        commissionPercent,
        payTodayCents: payFor(todayStart, todayEnd),
        payWeekCents: payFor(weekStart),
        payMonthCents: payFor(monthStart),
        tipWeekCents: tipsFor(member.id, weekStart),
        tipMonthCents: tipsFor(member.id, monthStart),
        today: mine.filter((c) => c.finishedAt >= todayStart && c.finishedAt < todayEnd).length,
        week: mine.filter((c) => c.finishedAt >= weekStart).length,
        month: mine.filter((c) => c.finishedAt >= monthStart).length,
        lifetime: stats.lifetime,
        bestDay: stats.bestDay,
        streak: stats.streak,
        avgTurnaroundMins:
          turnarounds.length === 0
            ? null
            : Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length),
        badges: badgesFor(stats),
      };
    })
    .sort((a, b) => b.month - a.month || b.lifetime - a.lifetime || a.name.localeCompare(b.name));
}
