import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { broadcastToStation } from "@/lib/station-events";
import { AppointmentStatus, StationRole } from "@prisma/client";
import { pickupThresholds } from "@/lib/pickups";

/**
 * Kennel units are described by a grid: `Station.kennelRows` ×
 * `Station.kennelColumns`. The individual `Kennel` rows are generated to fill
 * that grid so staff assign a dog to a door that matches the physical unit.
 *
 * How many pets fit behind one door is a shop-wide rule
 * (`SystemConfig.kennelCapacityPerCompartment`), not a per-unit setting:
 * compartments in a bank are the same size as each other.
 */

export const MAX_KENNEL_ROWS = 26; // one letter per row
export const MAX_KENNEL_COLUMNS = 24;

/** Door label for a grid position: row 1, column 3 → "A3". */
export function kennelLabel(row: number, column: number): string {
  return `${String.fromCharCode(64 + row)}${column}`;
}

/** Statuses where the pet is in the building and can be held in a kennel. */
export const KENNELABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
  AppointmentStatus.READY_PICKUP,
];

/** How many pets fit in one compartment, per the shop's rule. */
export async function compartmentCapacity(): Promise<number> {
  const config = await getConfig();
  return Math.max(1, config.kennelCapacityPerCompartment);
}

export interface GridSyncResult {
  created: number;
  removed: number;
  /** Labels kept because a pet is still inside them. */
  blocked: string[];
}

/**
 * Make a station's kennels match a rows × columns grid.
 *
 * Shrinking never evicts a dog: an out-of-range door that still holds a pet is
 * kept and reported back so the caller can tell the admin why.
 */
export async function syncKennelGrid(
  stationId: string,
  rows: number,
  columns: number
): Promise<GridSyncResult> {
  const existing = await prisma.kennel.findMany({
    where: { stationId },
    include: { _count: { select: { appointments: true } } },
  });
  const byPosition = new Map(existing.map((k) => [`${k.row}:${k.column}`, k]));

  const toCreate: { stationId: string; row: number; column: number; label: string }[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      if (!byPosition.has(`${row}:${column}`)) {
        toCreate.push({ stationId, row, column, label: kennelLabel(row, column) });
      }
    }
  }

  const outOfRange = existing.filter((k) => k.row > rows || k.column > columns);
  const occupied = outOfRange.filter((k) => k._count.appointments > 0);
  const removable = outOfRange.filter((k) => k._count.appointments === 0);

  if (toCreate.length > 0) {
    await prisma.kennel.createMany({ data: toCreate, skipDuplicates: true });
  }
  if (removable.length > 0) {
    await prisma.kennel.deleteMany({ where: { id: { in: removable.map((k) => k.id) } } });
  }

  return {
    created: toCreate.length,
    removed: removable.length,
    blocked: occupied.map((k) => k.label),
  };
}

/** Kennels a station holds, in reading order, with whoever is inside. */
export async function getKennelBoard(stationId: string) {
  return prisma.kennel.findMany({
    where: { stationId },
    include: {
      appointments: {
        where: { status: { in: KENNELABLE_STATUSES } },
        include: {
          pet: { select: { id: true, name: true, hasBiteHistory: true, species: true } },
          // No phone: this board is streamed to the unauthenticated kiosk.
          customer: { select: { firstName: true, lastName: true } },
          staff: { select: { name: true } },
        },
        orderBy: { kenneledAt: "asc" },
      },
    },
    orderBy: [{ row: "asc" }, { column: "asc" }],
  });
}

export type KennelBoard = Awaited<ReturnType<typeof getKennelBoard>>;

/** Every kennel station, each with its board. */
export async function getKennelStations() {
  const stations = await prisma.station.findMany({
    where: { role: StationRole.KENNEL },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    stations.map(async (station) => ({
      station,
      kennels: await getKennelBoard(station.id),
    }))
  );
}

/** Whether one more pet fits behind a given door. */
export async function kennelHasRoom(
  kennelId: string,
  exceptAppointmentId?: string
): Promise<boolean> {
  const [capacity, inside] = await Promise.all([
    compartmentCapacity(),
    prisma.appointment.count({
      where: {
        kennelId,
        status: { in: KENNELABLE_STATUSES },
        ...(exceptAppointmentId ? { NOT: { id: exceptAppointmentId } } : {}),
      },
    }),
  ]);
  return inside < capacity;
}

/**
 * Take a pet out of whatever kennel it is in.
 * Returns the station that changed so callers can refresh its display.
 */
export async function releaseKennelForAppointment(
  appointmentId: string
): Promise<string | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { kennelId: true, kennel: { select: { stationId: true } } },
  });
  if (!appointment?.kennelId) return null;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { kennelId: null, kenneledAt: null },
  });
  return appointment.kennel?.stationId ?? null;
}

/** Push the current board to any Pi screen watching this kennel unit. */
export async function broadcastKennelBoard(stationId: string): Promise<void> {
  const [station, kennels] = await Promise.all([
    prisma.station.findUnique({ where: { id: stationId } }),
    getKennelBoard(stationId),
  ]);
  if (!station) return;
  broadcastToStation(stationId, { type: "kennel_update", station, kennels });
}

/**
 * Kennel demand for a day.
 *
 * Every appointment is assumed to need a kennel, so a booking holds a space
 * without holding a specific door: the door is chosen at check-in. Capacity is
 * the doors in service multiplied by how many fit behind each one.
 */
export async function kennelDemand(
  start: Date,
  end: Date
): Promise<{
  capacity: number;
  occupied: number;
  reserved: number;
  free: number;
  perCompartment: number;
}> {
  const [perCompartment, doors, occupied, reserved] = await Promise.all([
    compartmentCapacity(),
    prisma.kennel.count({ where: { isActive: true, station: { isActive: true } } }),
    prisma.appointment.count({
      where: { kennelId: { not: null }, status: { in: KENNELABLE_STATUSES } },
    }),
    // Booked for the day, still expected, and not already behind a door.
    prisma.appointment.count({
      where: {
        needsKennel: true,
        kennelId: null,
        scheduledAt: { gte: start, lt: end },
        status: { in: [AppointmentStatus.SCHEDULED, ...KENNELABLE_STATUSES] },
      },
    }),
  ]);

  const capacity = doors * perCompartment;
  return {
    capacity,
    occupied,
    reserved,
    free: Math.max(0, capacity - occupied - reserved),
    perCompartment,
  };
}

/** Whether one more visit that day can be promised a kennel. */
export async function kennelAvailableFor(
  start: Date,
  end: Date
): Promise<{ ok: boolean; capacity: number; committed: number }> {
  const demand = await kennelDemand(start, end);
  return {
    ok: demand.capacity === 0 || demand.free > 0,
    capacity: demand.capacity,
    committed: demand.occupied + demand.reserved,
  };
}

export interface CapacityConflict {
  capacity: number;
  committed: number;
  free: number;
  /** Pets holding a kennel past the pickup grace period. */
  overstaying: {
    appointmentId: string;
    petName: string;
    ownerName: string;
    phone: string | null;
    kennelLabel: string;
    stationId: string;
    waitingMins: number;
  }[];
  /** Pets still expected today that need a kennel. */
  incoming: number;
  /** True when the incoming pets cannot all be given a kennel. */
  shortfall: number;
}

/**
 * Where the day's kennel space is about to run out.
 *
 * The common cause is a pet that is ready but not collected: it keeps a
 * compartment that the next arrival was counting on. This reports both sides so
 * the shop can chase the pickup before the problem lands.
 */
export async function capacityConflicts(start: Date, end: Date): Promise<CapacityConflict> {
  const [demand, thresholds] = await Promise.all([
    kennelDemand(start, end),
    pickupThresholds(),
  ]);
  const cutoff = new Date(Date.now() - thresholds.watchMins * 60 * 1000);

  const waiting = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.READY_PICKUP,
      kennelId: { not: null },
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      updatedAt: true,
      pet: { select: { name: true } },
      customer: { select: { firstName: true, lastName: true, phone: true } },
      kennel: { select: { label: true, stationId: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  return {
    capacity: demand.capacity,
    committed: demand.occupied + demand.reserved,
    free: demand.free,
    incoming: demand.reserved,
    shortfall: Math.max(0, demand.reserved - (demand.capacity - demand.occupied)),
    overstaying: waiting.map((appointment) => ({
      appointmentId: appointment.id,
      petName: appointment.pet.name,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      phone: appointment.customer.phone,
      kennelLabel: appointment.kennel?.label ?? "",
      stationId: appointment.kennel?.stationId ?? "",
      waitingMins: Math.round((Date.now() - appointment.updatedAt.getTime()) / 60000),
    })),
  };
}
