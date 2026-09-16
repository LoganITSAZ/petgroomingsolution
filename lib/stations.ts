import { prisma } from "@/lib/prisma";
import { AppointmentStatus, StationRole } from "@prisma/client";

/**
 * Station capacity.
 *
 * A work station holds `maxOccupancy` pets — usually one, but a bathing bay or
 * a drying row can legitimately hold several. A kennel unit's capacity is the
 * number of doors in service, because that is what physically limits it.
 */

/** Statuses that mean a pet is occupying the station it is assigned to. */
export const OCCUPYING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];

export interface CapacityInput {
  role: StationRole;
  kennels?: { isActive: boolean }[];
}

/**
 * A groom table or a bathing station holds exactly one pet — that is physical,
 * not a setting. A kennel unit holds its doors in service, each of which takes
 * however many pets the shop's rule allows.
 */
export function stationCapacity(station: CapacityInput, perCompartment = 1): number {
  if (station.role === StationRole.KENNEL) {
    return (station.kennels ?? []).filter((kennel) => kennel.isActive).length * perCompartment;
  }
  return 1;
}

/** How many pets are at a station right now, ignoring one appointment. */
async function stationOccupancy(
  stationId: string,
  exceptAppointmentId?: string
): Promise<number> {
  return prisma.appointment.count({
    where: {
      stationId,
      status: { in: OCCUPYING_STATUSES },
      ...(exceptAppointmentId ? { NOT: { id: exceptAppointmentId } } : {}),
    },
  });
}

/**
 * Whether one more pet fits. Moving an appointment that is already at the
 * station does not count against it.
 */
export async function stationHasRoom(
  stationId: string,
  exceptAppointmentId?: string
): Promise<boolean> {
  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { role: true },
  });
  if (!station) return false;

  // Kennel units are filled door by door, not by assigning the station itself.
  if (station.role === StationRole.KENNEL) return false;

  // A groom table or bathing station holds exactly one pet.
  const occupancy = await stationOccupancy(stationId, exceptAppointmentId);
  return occupancy < 1;
}

/**
 * Who should take this visit, and where.
 *
 * Customers are attached to a groomer, and groomers to a station, so neither
 * has to be chosen when the appointment is made. The station is only used when
 * it still has room and the groomer is allowed to work it.
 */
export async function defaultAssignment(customerId: string): Promise<{
  staffId: string | null;
  stationId: string | null;
}> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      preferredStaff: {
        select: {
          id: true,
          isActive: true,
          roles: true,
          defaultStation: {
            select: { id: true, isActive: true, role: true, allowedRoles: true },
          },
        },
      },
    },
  });

  const staff = customer?.preferredStaff;
  if (!staff || !staff.isActive) return { staffId: null, stationId: null };

  const station = staff.defaultStation;
  if (!station || !station.isActive || station.role === StationRole.KENNEL) {
    return { staffId: staff.id, stationId: null };
  }
  if (
    station.allowedRoles.length > 0 &&
    !station.allowedRoles.some((role) => staff.roles.includes(role))
  ) {
    return { staffId: staff.id, stationId: null };
  }

  const hasRoom = await stationHasRoom(station.id);
  return { staffId: staff.id, stationId: hasRoom ? station.id : null };
}

/**
 * Stations are named after the work they do, so adding one needs no typing.
 * The shop can still rename any of them.
 */
const STATION_NAME_PREFIX: Record<StationRole, string> = {
  GROOMER: "Grooming Table",
  BATHING: "Bath",
  DRYING: "Dryer",
  KENNEL: "Kennel Bank",
  REGISTER: "Register",
};

/**
 * The lowest unused number for the role, so removing Bath 2 and adding one
 * back gives Bath 2 again rather than leaving a hole and counting to 4.
 */
export function nextStationName(role: StationRole, existingNames: string[]): string {
  const prefix = STATION_NAME_PREFIX[role];
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = `${prefix} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * `nextStationName` against what is already on file, active or not. A station
 * being renamed does not block its own number.
 */
export async function suggestStationName(role: StationRole, exceptId?: string): Promise<string> {
  const existing = await prisma.station.findMany({
    where: { role, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
  });
  return nextStationName(role, existing.map((station) => station.name));
}
