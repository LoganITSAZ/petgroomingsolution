import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { MIN_VISITS_FOR_PATTERN } from "@/lib/rhythm";

/**
 * What this pet usually gets, and is not getting today.
 *
 * Asked at the counter, never on the booking form. A suggestion while the
 * visit is being booked is a different feature with a different risk -- it
 * shapes what the shop sells before anybody has seen the dog. This one only
 * says the ticket looks unlike every other ticket for the same pet, which is
 * as often a line somebody forgot to add as it is a sale.
 *
 * No new table and no new column: the habit is `AppointmentService` rows the
 * shop has always written.
 */

/** Visits looked at. The same ten as `lib/visit-duration.ts`, for the same reason. */
export const ADD_ON_HISTORY_VISITS = 10;

/**
 * How much of the pet's history a service has to appear in. Half is the point
 * where "usually" is honestly the word -- below it the counter is being asked
 * to upsell from noise, which is how a prompt like this gets ignored.
 */
export const ADD_ON_MIN_SHARE = 0.5;

export interface UsualAddOn {
  serviceId: string;
  name: string;
  /** Visits that included it, out of the visits looked at. The evidence. */
  seen: number;
  of: number;
}

/**
 * The habit, from past visits and what is on the ticket now.
 *
 * Pure, so the thresholds are testable without a database, and it holds to the
 * insights rule: nothing at all below `MIN_VISITS_FOR_PATTERN` visits, because
 * a habit read off two visits is a coincidence.
 */
export function usualAddOns(
  history: string[][],
  onTicket: string[]
): { serviceId: string; seen: number; of: number }[] {
  if (history.length < MIN_VISITS_FOR_PATTERN) return [];

  const already = new Set(onTicket);
  const seen = new Map<string, number>();
  for (const visit of history) {
    // Once per visit, however many lines carried it.
    for (const serviceId of new Set(visit)) {
      seen.set(serviceId, (seen.get(serviceId) ?? 0) + 1);
    }
  }

  return [...seen.entries()]
    .filter(([serviceId, count]) => !already.has(serviceId) && count / history.length >= ADD_ON_MIN_SHARE)
    .map(([serviceId, count]) => ({ serviceId, seen: count, of: history.length }))
    .sort((a, b) => b.seen - a.seen || a.serviceId.localeCompare(b.serviceId));
}

/**
 * The prompt for one visit, named. Empty when the pet has too little history,
 * when the ticket already carries everything, or when the habit is a service
 * the shop has since retired -- there is nothing to offer in any of those.
 */
export async function addOnPromptsFor(appointmentId: string): Promise<UsualAddOn[]> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { petId: true, services: { select: { serviceId: true } } },
  });
  if (!appointment) return [];

  const past = await prisma.appointment.findMany({
    where: {
      petId: appointment.petId,
      status: { in: FINISHED_STATUSES },
      NOT: { id: appointmentId },
    },
    orderBy: { scheduledAt: "desc" },
    take: ADD_ON_HISTORY_VISITS,
    select: { services: { select: { serviceId: true } } },
  });

  const habits = usualAddOns(
    past.map((visit) =>
      visit.services.map((line) => line.serviceId).filter((id): id is string => id != null)
    ),
    appointment.services.map((line) => line.serviceId).filter((id): id is string => id != null)
  );
  if (habits.length === 0) return [];

  const services = await prisma.service.findMany({
    where: { id: { in: habits.map((habit) => habit.serviceId) }, isActive: true },
    select: { id: true, name: true },
  });
  const nameFor = new Map(services.map((service) => [service.id, service.name]));

  return habits.flatMap((habit) => {
    const name = nameFor.get(habit.serviceId);
    return name ? [{ ...habit, name }] : [];
  });
}
