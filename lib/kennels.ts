import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { STATION_APPOINTMENT_SELECT, broadcastToStation } from "@/lib/station-events";
import { AppointmentStatus } from "@prisma/client";
import { pickupThresholds } from "@/lib/pickups";

/**
 * Kennel units are described by a grid: `Station.kennelRows` ×
 * `Station.kennelColumns`. The individual `Kennel` rows are generated to fill
 * that grid so staff assign a dog to a door that matches the physical unit.
 *
 * How many pets fit behind one door is a shop-wide rule
 * (`SystemConfig.kennelCapacityPerCompartment`), not a per-unit setting:
 * compartments in a bank are the same size as each other.
 *
 * The one exception is a household. Dogs booked in together from the same home
 * are kennelled together on purpose — several small dogs behind one door — so
 * `SystemConfig.kennelHouseholdMaxPerCompartment` is a second, higher limit
 * that applies only while every pet inside belongs to the same customer.
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

/**
 * How many pets from ONE household may share a compartment.
 *
 * The shop-wide rule is written for unrelated dogs, which is why it is usually
 * one. A family that brings four small dogs in together is kennelled together
 * on purpose, so a door may hold more than the rule allows as long as every
 * pet behind it belongs to the same customer. Never below the general rule —
 * a household is not a reason to fit fewer.
 */
export async function householdCompartmentLimit(): Promise<number> {
  const config = await getConfig();
  return Math.max(
    Math.max(1, config.kennelCapacityPerCompartment),
    config.kennelHouseholdMaxPerCompartment
  );
}

export interface CompartmentRoom {
  ok: boolean;
  /** The limit that applied — the household one only when sharing. */
  limit: number;
  /** True when the limit in play is the household allowance. */
  sharedHousehold: boolean;
  inside: number;
}

/**
 * The whole capacity rule for one door, with no database in it.
 *
 * `occupantCustomerIds` is who is already inside; `customerId` is the pet
 * asking for the space. Same household means *every* pet inside belongs to
 * that same customer — one unrelated dog in the door drops it back to the
 * general rule, because the extra room was never about the door's size.
 */
export function compartmentRoom(
  occupantCustomerIds: string[],
  customerId: string | null,
  perCompartment: number,
  householdMax: number
): CompartmentRoom {
  const general = Math.max(1, perCompartment);
  const household = Math.max(general, householdMax);
  const inside = occupantCustomerIds.length;

  const sharedHousehold =
    inside > 0 && customerId != null && occupantCustomerIds.every((id) => id === customerId);
  const limit = sharedHousehold ? household : general;

  return { ok: inside < limit, limit, sharedHousehold, inside };
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
        select: { ...STATION_APPOINTMENT_SELECT, customerId: true, kenneledAt: true },
        orderBy: { kenneledAt: "asc" },
      },
    },
    orderBy: [{ row: "asc" }, { column: "asc" }],
  });
}

export type KennelBoard = Awaited<ReturnType<typeof getKennelBoard>>;

/**
 * Whether one more pet fits behind a given door.
 *
 * Pass the appointment being placed: who its owner is decides whether the
 * household allowance applies, so the answer is about that pet, not the door
 * in the abstract.
 */
async function kennelRoomFor(
  kennelId: string,
  appointmentId?: string
): Promise<CompartmentRoom> {
  const [perCompartment, householdMax, occupants, moving] = await Promise.all([
    compartmentCapacity(),
    householdCompartmentLimit(),
    prisma.appointment.findMany({
      where: {
        kennelId,
        status: { in: KENNELABLE_STATUSES },
        ...(appointmentId ? { NOT: { id: appointmentId } } : {}),
      },
      select: { customerId: true },
    }),
    appointmentId
      ? prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { customerId: true },
        })
      : null,
  ]);

  return compartmentRoom(
    occupants.map((occupant) => occupant.customerId),
    moving?.customerId ?? null,
    perCompartment,
    householdMax
  );
}

/** Whether one more pet fits behind a given door. */
export async function kennelHasRoom(
  kennelId: string,
  exceptAppointmentId?: string
): Promise<boolean> {
  return (await kennelRoomFor(kennelId, exceptAppointmentId)).ok;
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

  /*
   * Capacity is deliberately the general rule, not the household allowance:
   * sharing depends on who turns up together, so it is headroom on the day and
   * never a space the shop can promise in advance.
   */
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
