import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@prisma/client";
import { arrivalLevel, arrivalThresholds, minutesLate } from "@/lib/arrivals";
import { pickupWatchlist, formatWait } from "@/lib/pickups";
import { capacityConflicts } from "@/lib/kennels";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { shopDayRange } from "@/lib/utils";

/**
 * Service-level problems, in one place.
 *
 * These are things a customer would notice: a pet that has been waiting too
 * long to go home, an arrival nobody has chased, a groom overrunning its slot.
 * Each one names the pets involved so it can be acted on, not just counted.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export interface ServiceAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  /** The pets or people it concerns. */
  detail: string;
  href: string;
}

export const ALERT_CLASS: Record<AlertSeverity, string> = {
  info: "bg-stone-100 text-stone-600",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
};

export const ALERT_DOT: Record<AlertSeverity, string> = {
  info: "bg-stone-400",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Names, trimmed to something readable in a narrow panel. */
function list(names: string[], limit = 3): string {
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} +${names.length - limit}`;
}

export async function serviceAlerts(): Promise<ServiceAlert[]> {
  const { start, end } = shopDayRange();

  const [pickups, arrivals, waiting, onFloor, conflicts] = await Promise.all([
    pickupWatchlist(),
    arrivalThresholds(),
    // Checked in, nowhere to be, nobody on them.
    prisma.appointment.findMany({
      where: { status: AppointmentStatus.CHECKED_IN, stationId: null },
      select: { id: true, checkedInAt: true, staffId: true, pet: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { status: { in: OCCUPYING_STATUSES } },
      select: {
        id: true,
        checkedInAt: true,
        durationMins: true,
        staffId: true,
        pet: { select: { name: true } },
      },
    }),
    capacityConflicts(start, end),
  ]);

  const scheduled = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gte: start, lt: end },
    },
    select: { id: true, scheduledAt: true, pet: { select: { name: true } } },
  });

  const alerts: ServiceAlert[] = [];

  // ── Pets that should have gone home by now ────────────────
  const critical = pickups.pets.filter((pet) => pet.level === "critical");
  const late = pickups.pets.filter((pet) => pet.level === "late");
  const watch = pickups.pets.filter((pet) => pet.level === "watch");

  if (critical.length > 0) {
    alerts.push({
      id: "pickup-critical",
      severity: "critical",
      title: `${critical.length} pet${critical.length === 1 ? "" : "s"} very late for pickup`,
      detail: list(critical.map((pet) => `${pet.petName} ${formatWait(pet.waitingMins)}`)),
      href: "/staff/appointments?group=finished",
    });
  }
  if (late.length > 0) {
    alerts.push({
      id: "pickup-late",
      severity: "warning",
      title: `${late.length} late pickup${late.length === 1 ? "" : "s"}`,
      detail: list(late.map((pet) => `${pet.petName} ${formatWait(pet.waitingMins)}`)),
      href: "/staff/appointments?group=finished",
    });
  }
  if (watch.length > 0 && critical.length === 0 && late.length === 0) {
    alerts.push({
      id: "pickup-watch",
      severity: "info",
      title: `${watch.length} waiting to be collected`,
      detail: list(watch.map((pet) => `${pet.petName} ${formatWait(pet.waitingMins)}`)),
      href: "/staff/appointments?group=finished",
    });
  }

  // ── Arrivals nobody has chased ────────────────────────────
  const missed = scheduled.filter(
    (visit) => arrivalLevel(visit.scheduledAt, arrivals) === "missed"
  );
  const runningLate = scheduled.filter((visit) =>
    ["late", "very_late"].includes(arrivalLevel(visit.scheduledAt, arrivals))
  );

  if (missed.length > 0) {
    alerts.push({
      id: "arrival-missed",
      severity: "critical",
      title: `${missed.length} appointment${missed.length === 1 ? "" : "s"} treated as missed`,
      detail: list(missed.map((visit) => `${visit.pet.name} ${minutesLate(visit.scheduledAt)}m`)),
      href: "/staff/appointments",
    });
  }
  if (runningLate.length > 0) {
    alerts.push({
      id: "arrival-late",
      severity: "warning",
      title: `${runningLate.length} arrival${runningLate.length === 1 ? "" : "s"} running late`,
      detail: list(
        runningLate.map((visit) => `${visit.pet.name} ${minutesLate(visit.scheduledAt)}m`)
      ),
      href: "/staff/appointments",
    });
  }

  // ── In the shop, but nothing happening to them ────────────
  const stalled = waiting.filter(
    (visit) =>
      visit.checkedInAt != null &&
      Date.now() - visit.checkedInAt.getTime() > 30 * 60 * 1000
  );
  if (stalled.length > 0) {
    alerts.push({
      id: "waiting-unstarted",
      severity: "warning",
      title: `${stalled.length} checked in over 30 min ago, not started`,
      detail: list(stalled.map((visit) => visit.pet.name)),
      href: "/staff",
    });
  }

  const unstaffed = onFloor.filter((visit) => !visit.staffId);
  if (unstaffed.length > 0) {
    alerts.push({
      id: "no-groomer",
      severity: "info",
      title: `${unstaffed.length} pet${unstaffed.length === 1 ? "" : "s"} with no groomer`,
      detail: list(unstaffed.map((visit) => visit.pet.name)),
      href: "/staff",
    });
  }

  // ── Grooms overrunning their slot ─────────────────────────
  const overrunning = onFloor.filter((visit) => {
    if (!visit.checkedInAt || !visit.durationMins) return false;
    const elapsed = (Date.now() - visit.checkedInAt.getTime()) / 60000;
    return elapsed > visit.durationMins * 1.25;
  });
  if (overrunning.length > 0) {
    alerts.push({
      id: "overrunning",
      severity: "warning",
      title: `${overrunning.length} groom${overrunning.length === 1 ? "" : "s"} over the booked time`,
      detail: list(
        overrunning.map((visit) => {
          const elapsed = Math.round((Date.now() - visit.checkedInAt!.getTime()) / 60000);
          return `${visit.pet.name} ${elapsed}/${visit.durationMins}m`;
        })
      ),
      href: "/staff/stations",
    });
  }

  // ── Nowhere to put the next arrival ───────────────────────
  if (conflicts.shortfall > 0) {
    alerts.push({
      id: "kennel-shortfall",
      severity: "critical",
      title: `Kennel space short by ${conflicts.shortfall}`,
      detail: `${conflicts.committed}/${conflicts.capacity} committed today`,
      href: "/staff/stations",
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
