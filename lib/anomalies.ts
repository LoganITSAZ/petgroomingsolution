import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import type { Insight } from "@/lib/insights";

/**
 * Is this week unlike the shop's own normal?
 *
 * Every other observation in the app is a threshold: a pickup is late past so
 * many minutes, a kennel is tight past so many doors. A threshold cannot see a
 * no-show rate that has quietly doubled while staying under every number the
 * shop ever set, and that is the shape most trouble arrives in.
 *
 * So this compares the shop only with itself: the last week against the eight
 * before it. No seasonal model, no forecast — the shop's own recent past is
 * the only baseline that needs no explaining to the person reading it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The week under test. */
export const RECENT_DAYS = 7;
/** What it is compared against. Long enough that one bad week does not become normal. */
export const BASELINE_DAYS = 56;

/** Below this many settled visits in the week, a rate is one or two customers. */
const MIN_RECENT_SETTLED = 8;
/** Below this many in the baseline, there is no "normal" to be unlike. */
const MIN_BASELINE_SETTLED = 30;

/** A rate must move by at least this much of itself before it is worth saying. */
const MIN_RELATIVE_SHIFT = 0.5;
/** ...and by at least this many points, so 1% to 2% is not called a doubling. */
const MIN_ABSOLUTE_SHIFT = 0.05;

export interface Window {
  /** Calendar days the window covers. */
  days: number;
  finished: number;
  noShows: number;
  cancelled: number;
  walkIns: number;
}

/** Visits that reached an outcome — the denominator for every rate below. */
export function settled(window: Window): number {
  return window.finished + window.noShows + window.cancelled;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * How the recent window differs from the baseline, as insights.
 *
 * Pure: two counted windows in, observations out. Each carries the two figures
 * it compared, because "no-shows are up" with nothing behind it is a claim the
 * reader cannot check — the rule the whole insights module is built on.
 */
export function compareWindows(recent: Window, baseline: Window): Insight[] {
  const recentSettled = settled(recent);
  const baselineSettled = settled(baseline);
  if (recentSettled < MIN_RECENT_SETTLED || baselineSettled < MIN_BASELINE_SETTLED) return [];

  const insights: Insight[] = [];

  /** A rate that moved enough, in both senses, to be worth a line. */
  const shifted = (now: number, was: number): "up" | "down" | null => {
    const absolute = Math.abs(now - was);
    if (absolute < MIN_ABSOLUTE_SHIFT) return null;
    // A baseline of zero cannot be divided into; the absolute floor above has
    // already decided the move is big enough to say out loud.
    if (was > 0 && absolute / was < MIN_RELATIVE_SHIFT) return null;
    return now > was ? "up" : "down";
  };

  const noShowNow = rate(recent.noShows, recentSettled);
  const noShowWas = rate(baseline.noShows, baselineSettled);
  const noShowMove = shifted(noShowNow, noShowWas);
  if (noShowMove === "up") {
    insights.push({
      id: "anomaly-no-shows",
      tone: "warning",
      title: `No-shows are up: ${percent(noShowNow)} this week`,
      detail: "Worth confirming tomorrow's bookings by phone until it settles.",
      evidence: `${recent.noShows} of ${recentSettled} settled visits in the last ${recent.days} days, against ${percent(noShowWas)} (${baseline.noShows} of ${baselineSettled}) over the ${baseline.days} before.`,
      href: "/staff/appointments",
    });
  }

  const cancelNow = rate(recent.cancelled, recentSettled);
  const cancelWas = rate(baseline.cancelled, baselineSettled);
  if (shifted(cancelNow, cancelWas) === "up") {
    insights.push({
      id: "anomaly-cancellations",
      tone: "warning",
      title: `Cancellations are up: ${percent(cancelNow)} this week`,
      detail: "Those slots can be refilled from the households already due a groom.",
      evidence: `${recent.cancelled} of ${recentSettled} settled visits in the last ${recent.days} days, against ${percent(cancelWas)} (${baseline.cancelled} of ${baselineSettled}) over the ${baseline.days} before.`,
      href: "/staff/appointments",
    });
  }

  const walkInNow = rate(recent.walkIns, recentSettled);
  const walkInWas = rate(baseline.walkIns, baselineSettled);
  const walkInMove = shifted(walkInNow, walkInWas);
  if (walkInMove) {
    insights.push({
      id: "anomaly-walk-ins",
      tone: "neutral",
      title: `Walk-ins are ${walkInMove}: ${percent(walkInNow)} of visits this week`,
      detail:
        walkInMove === "up"
          ? "Hold a little capacity back rather than booking the day solid."
          : "The diary can be booked tighter while this holds.",
      evidence: `${recent.walkIns} of ${recentSettled} settled visits in the last ${recent.days} days, against ${percent(walkInWas)} (${baseline.walkIns} of ${baselineSettled}) over the ${baseline.days} before.`,
    });
  }

  // Volume is a count per day rather than a rate, so it gets its own test: a
  // quiet week is not a share of anything, it is simply fewer pets.
  const finishedNow = recent.finished / recent.days;
  const finishedWas = baseline.finished / baseline.days;
  if (finishedWas > 0 && Math.abs(finishedNow - finishedWas) / finishedWas >= 0.25) {
    const direction = finishedNow > finishedWas ? "busier" : "quieter";
    insights.push({
      id: "anomaly-volume",
      tone: direction === "busier" ? "neutral" : "warning",
      title: `This week is ${direction} than usual`,
      detail:
        direction === "busier"
          ? "Check the rota covers it before the back end of the week."
          : "Time to work the rebooking list while there is room to take the bookings.",
      evidence: `${finishedNow.toFixed(1)} finished visits a day over the last ${recent.days}, against ${finishedWas.toFixed(1)} a day over the ${baseline.days} before.`,
      href: direction === "busier" ? "/admin/schedule" : "/staff/rebooking",
    });
  }

  return insights;
}

/** Count one window of the shop's diary. */
async function countWindow(from: Date, to: Date, days: number): Promise<Window> {
  const rows = await prisma.appointment.groupBy({
    by: ["status", "appointmentType"],
    where: { scheduledAt: { gte: from, lt: to } },
    _count: { _all: true },
  });

  const total = (match: (row: (typeof rows)[number]) => boolean): number =>
    rows.filter(match).reduce((sum, row) => sum + row._count._all, 0);

  return {
    days,
    finished: total((row) => FINISHED_STATUSES.includes(row.status)),
    noShows: total((row) => row.status === AppointmentStatus.NO_SHOW),
    cancelled: total((row) => row.status === AppointmentStatus.CANCELLED),
    walkIns: total((row) => row.appointmentType === AppointmentType.WALK_IN),
  };
}

/** What has changed about the shop this week. */
export async function shopAnomalies(now: Date = new Date()): Promise<Insight[]> {
  const recentFrom = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  const baselineFrom = new Date(recentFrom.getTime() - BASELINE_DAYS * DAY_MS);

  const [recent, baseline] = await Promise.all([
    countWindow(recentFrom, now, RECENT_DAYS),
    countWindow(baselineFrom, recentFrom, BASELINE_DAYS),
  ]);

  return compareWindows(recent, baseline);
}
