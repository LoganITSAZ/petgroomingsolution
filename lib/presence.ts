import { prisma } from "@/lib/prisma";
import { StaffPresence } from "@prisma/client";
import { OCCUPYING_STATUSES } from "@/lib/stations";

/**
 * Who is on the floor, and what they are doing.
 *
 * Four states are set by the person: signed off, ready, on break, restroom.
 * "Working" is never stored — it is derived from holding a pet, so it cannot
 * drift out of step with the appointments themselves.
 */

export type FloorState = StaffPresence | "WORKING";

export const PRESENCE_LABEL: Record<FloorState, string> = {
  OFF_SHIFT: "Signed off",
  READY: "Ready",
  WORKING: "With a pet",
  BREAK: "On break",
  RESTROOM: "Restroom",
};

export const PRESENCE_CLASS: Record<FloorState, string> = {
  OFF_SHIFT: "bg-stone-100 text-stone-500",
  READY: "bg-green-100 text-green-700",
  WORKING: "bg-amber-100 text-amber-800",
  BREAK: "bg-sky-100 text-sky-700",
  RESTROOM: "bg-purple-100 text-purple-700",
};

/** The states a person can put themselves in, in the order they are offered. */
export const SETTABLE_PRESENCE: StaffPresence[] = [
  StaffPresence.READY,
  StaffPresence.RESTROOM,
  StaffPresence.BREAK,
  StaffPresence.OFF_SHIFT,
];

export interface FloorMember {
  id: string;
  name: string;
  roles: string[];
  presence: StaffPresence;
  /** What they are actually doing, once a pet in hand is taken into account. */
  state: FloorState;
  since: Date;
  minutesInState: number;
  /** The pet they are holding, when they are holding one. */
  working: {
    appointmentId: string;
    petName: string;
    stationId: string | null;
    stationName: string | null;
  } | null;
  defaultStationId: string | null;
}

/** Record a presence change and stamp the person with it. */
export async function setPresence(
  staffId: string,
  presence: StaffPresence,
  note?: string
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.staff.update({
      where: { id: staffId },
      data: { presence, presenceSince: now },
    }),
    prisma.staffPresenceEvent.create({
      data: { staffId, presence, changedAt: now, note: note ?? null },
    }),
  ]);
}

/** Everyone who works pets, with what they are doing right now. */
export async function floorRoster(): Promise<FloorMember[]> {
  const [staff, working] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: ["GROOMER", "BATHER"] } },
      select: {
        id: true,
        name: true,
        roles: true,
        presence: true,
        presenceSince: true,
        defaultStationId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: { status: { in: OCCUPYING_STATUSES }, staffId: { not: null } },
      select: {
        id: true,
        staffId: true,
        pet: { select: { name: true } },
        station: { select: { id: true, name: true } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
  ]);

  const byStaff = new Map(working.map((visit) => [visit.staffId as string, visit]));

  return staff.map((member) => {
    const visit = byStaff.get(member.id) ?? null;
    // Holding a pet outranks whatever they last tapped, except when they have
    // signed off — that is a fact about the person, not the pet.
    const state: FloorState =
      visit && member.presence !== StaffPresence.OFF_SHIFT ? "WORKING" : member.presence;

    return {
      id: member.id,
      name: member.name,
      roles: member.roles,
      presence: member.presence,
      state,
      since: member.presenceSince,
      minutesInState: Math.max(
        0,
        Math.round((Date.now() - member.presenceSince.getTime()) / 60000)
      ),
      working: visit
        ? {
            appointmentId: visit.id,
            petName: visit.pet.name,
            stationId: visit.station?.id ?? null,
            stationName: visit.station?.name ?? null,
          }
        : null,
      defaultStationId: member.defaultStationId,
    };
  });
}

/** People free to pick up the next pet. */
export function availableStaff(roster: FloorMember[]): FloorMember[] {
  return roster.filter((member) => member.state === "READY");
}
