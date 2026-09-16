import { prisma } from "@/lib/prisma";
import { AppointmentStatus, StationRole } from "@prisma/client";
import { floorRoster, availableStaff, type FloorMember } from "@/lib/presence";
import { OCCUPYING_STATUSES, WORK_STATION_ROLES } from "@/lib/stations";

/**
 * What to do with the next open station.
 *
 * Three things have to line up: a station with nothing on it, a pet waiting to
 * be worked, and someone free who is allowed to work that station. This pairs
 * them and says why, so the suggestion can be judged rather than obeyed.
 */

export interface Suggestion {
  stationId: string;
  stationName: string;
  stationRole: StationRole;
  appointmentId: string;
  petName: string;
  ownerName: string;
  hasBiteHistory: boolean;
  waitingMins: number;
  staffId: string;
  staffName: string;
  /** Why this pairing, in the order the reasons carried weight. */
  reasons: string[];
  score: number;
}

/** Pets checked in, not yet at a station, longest wait first. */
async function waitingPets() {
  const waiting = await prisma.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.DRYING] },
      stationId: null,
    },
    select: {
      id: true,
      checkedInAt: true,
      scheduledAt: true,
      status: true,
      staffId: true,
      pet: { select: { name: true, hasBiteHistory: true } },
      customer: {
        select: { firstName: true, lastName: true, preferredStaffId: true },
      },
      services: { include: { service: { select: { category: true } } }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { checkedInAt: "asc" },
  });

  return waiting.map((visit) => ({
    ...visit,
    waitingMins: visit.checkedInAt
      ? Math.max(0, Math.round((Date.now() - visit.checkedInAt.getTime()) / 60000))
      : 0,
  }));
}

/** Does this person's role satisfy the station's restriction? */
function allowedAtStation(member: FloorMember, allowedRoles: string[]): boolean {
  return allowedRoles.length === 0 || allowedRoles.some((role) => member.roles.includes(role));
}

/**
 * Suggestions for every empty work station, best first.
 *
 * Each station and each pet is used once: the list is a plan for the next few
 * minutes, not a menu of overlapping options.
 */
export async function assignmentSuggestions(): Promise<Suggestion[]> {
  const [stations, occupied, roster, waiting] = await Promise.all([
    prisma.station.findMany({
      where: { isActive: true, role: { in: WORK_STATION_ROLES } },
      select: { id: true, name: true, role: true, allowedRoles: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.appointment.findMany({
      where: { status: { in: OCCUPYING_STATUSES }, stationId: { not: null } },
      select: { stationId: true },
    }),
    floorRoster(),
    waitingPets(),
  ]);

  const busyStations = new Set(occupied.map((visit) => visit.stationId as string));
  const openStations = stations.filter((station) => !busyStations.has(station.id));
  const free = availableStaff(roster);

  const suggestions: Suggestion[] = [];
  const usedStaff = new Set<string>();
  const usedPets = new Set<string>();

  for (const station of openStations) {
    let best: Suggestion | null = null;

    for (const visit of waiting) {
      if (usedPets.has(visit.id)) continue;

      for (const member of free) {
        if (usedStaff.has(member.id)) continue;
        if (!allowedAtStation(member, station.allowedRoles)) continue;

        const reasons: string[] = [];
        let score = 0;

        // The pet's own groomer is the strongest signal there is.
        if (visit.customer.preferredStaffId === member.id) {
          score += 50;
          reasons.push("their usual groomer");
        }
        // An assignment already made should be honoured, not overridden.
        if (visit.staffId === member.id) {
          score += 40;
          reasons.push("already assigned to this visit");
        } else if (visit.staffId) {
          score -= 30;
        }
        // People work where they normally work.
        if (member.defaultStationId === station.id) {
          score += 20;
          reasons.push("their usual station");
        }
        // Bathing work belongs on a bathing station, grooming on a table.
        const wantsBath = visit.services.some((line) => line.service?.category === "BATH");
        if (wantsBath && station.role === StationRole.BATHING) {
          score += 15;
          reasons.push("bathing service, bathing station");
        }
        if (!wantsBath && station.role === StationRole.GROOMER) {
          score += 10;
        }
        // Whoever has been standing around longest goes first.
        score += Math.min(member.minutesInState, 60) / 6;
        // And the pet that has waited longest.
        score += Math.min(visit.waitingMins, 120) / 4;
        if (visit.waitingMins >= 30) {
          reasons.push(`waiting ${visit.waitingMins} min`);
        }

        const candidate: Suggestion = {
          stationId: station.id,
          stationName: station.name,
          stationRole: station.role,
          appointmentId: visit.id,
          petName: visit.pet.name,
          ownerName: `${visit.customer.firstName} ${visit.customer.lastName}`,
          hasBiteHistory: visit.pet.hasBiteHistory,
          waitingMins: visit.waitingMins,
          staffId: member.id,
          staffName: member.name,
          reasons: reasons.length > 0 ? reasons : ["free now"],
          score,
        };

        if (!best || candidate.score > best.score) best = candidate;
      }
    }

    if (best) {
      suggestions.push(best);
      usedStaff.add(best.staffId);
      usedPets.add(best.appointmentId);
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

export interface FloorBlockers {
  openStations: number;
  waitingPets: number;
  readyStaff: number;
  /** Why nothing can be suggested, when nothing can. */
  blocked: string | null;
}

/** Reads the floor and explains a standstill rather than showing nothing. */
export async function floorBlockers(): Promise<FloorBlockers> {
  const [stations, occupied, roster, waiting] = await Promise.all([
    prisma.station.count({ where: { isActive: true, role: { in: WORK_STATION_ROLES } } }),
    prisma.appointment.findMany({
      where: { status: { in: OCCUPYING_STATUSES }, stationId: { not: null } },
      select: { stationId: true },
    }),
    floorRoster(),
    prisma.appointment.count({
      where: {
        status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.DRYING] },
        stationId: null,
      },
    }),
  ]);

  const openStations = stations - new Set(occupied.map((v) => v.stationId as string)).size;
  const readyStaff = availableStaff(roster).length;

  let blocked: string | null = null;
  if (openStations > 0 && waiting > 0 && readyStaff === 0) {
    const onBreak = roster.filter((m) => m.state === "BREAK" || m.state === "RESTROOM").length;
    blocked =
      onBreak > 0
        ? `${waiting} pet${waiting === 1 ? "" : "s"} waiting and ${openStations} station${openStations === 1 ? "" : "s"} open, but nobody is ready — ${onBreak} away from the floor.`
        : `${waiting} pet${waiting === 1 ? "" : "s"} waiting and ${openStations} station${openStations === 1 ? "" : "s"} open, but nobody has signed in as ready.`;
  } else if (openStations > 0 && readyStaff > 0 && waiting === 0) {
    blocked = `${readyStaff} ready and ${openStations} station${openStations === 1 ? "" : "s"} open — no pets waiting.`;
  }

  return { openStations, waitingPets: waiting, readyStaff, blocked };
}
