import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { AppointmentStatus } from "@prisma/client";

/**
 * Pets that are finished and waiting to go home.
 *
 * A short wait is normal; a long one ties up a kennel and eventually means
 * something has gone wrong. The shop sets the thresholds, because "late"
 * depends on how the shop runs.
 */

export type PickupLevel = "waiting" | "watch" | "late" | "critical";

export interface PickupThresholds {
  watchMins: number;
  lateMins: number;
  criticalMins: number;
}

export async function pickupThresholds(): Promise<PickupThresholds> {
  const config = await getConfig();
  // Kept in order even if the settings are saved out of order.
  const watchMins = Math.max(1, config.pickupWatchMins);
  const lateMins = Math.max(watchMins + 1, config.pickupLateMins);
  const criticalMins = Math.max(lateMins + 1, config.pickupCriticalMins);
  return { watchMins, lateMins, criticalMins };
}

function pickupLevel(waitingMins: number, thresholds: PickupThresholds): PickupLevel {
  if (waitingMins >= thresholds.criticalMins) return "critical";
  if (waitingMins >= thresholds.lateMins) return "late";
  if (waitingMins >= thresholds.watchMins) return "watch";
  return "waiting";
}

export const PICKUP_LEVEL_LABEL: Record<PickupLevel, string> = {
  waiting: "Waiting",
  watch: "Waiting a while",
  late: "Late pickup",
  critical: "Very late",
};

export const PICKUP_LEVEL_CLASS: Record<PickupLevel, string> = {
  waiting: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  late: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-700",
};

export interface WaitingPet {
  appointmentId: string;
  petName: string;
  petId: string;
  ownerName: string;
  phone: string | null;
  kennelLabel: string | null;
  stationId: string | null;
  readySince: Date;
  waitingMins: number;
  level: PickupLevel;
}

/** Everyone currently ready and not yet collected, longest wait first. */
export async function pickupWatchlist(): Promise<{
  thresholds: PickupThresholds;
  pets: WaitingPet[];
}> {
  const [thresholds, waiting] = await Promise.all([
    pickupThresholds(),
    prisma.appointment.findMany({
      where: { status: AppointmentStatus.READY_PICKUP },
      select: {
        id: true,
        updatedAt: true,
        pet: { select: { id: true, name: true } },
        customer: { select: { firstName: true, lastName: true, phone: true } },
        kennel: { select: { label: true, stationId: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  const pets = waiting.map((appointment) => {
    // READY_PICKUP is the last thing written, so updatedAt is when it became ready.
    const waitingMins = Math.max(
      0,
      Math.round((Date.now() - appointment.updatedAt.getTime()) / 60000)
    );
    return {
      appointmentId: appointment.id,
      petId: appointment.pet.id,
      petName: appointment.pet.name,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      phone: appointment.customer.phone,
      kennelLabel: appointment.kennel?.label ?? null,
      stationId: appointment.kennel?.stationId ?? null,
      readySince: appointment.updatedAt,
      waitingMins,
      level: pickupLevel(waitingMins, thresholds),
    };
  });

  return { thresholds, pets: pets.sort((a, b) => b.waitingMins - a.waitingMins) };
}

/** Formats 135 as "2h 15m". */
export function formatWait(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
