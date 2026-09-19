"use server";

import { AppointmentStatus, Prisma, StationRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { broadcastStationBoard } from "@/lib/appointment-status";
import { broadcastKennelBoard, compartmentRoom, KENNELABLE_STATUSES, stationLimits } from "@/lib/kennels";
import { OCCUPYING_STATUSES } from "@/lib/stations";

/** Check in and place a pet atomically, including capacity and audit history. */
export async function assignLifecycleDestination(appointmentId: string, destination: string): Promise<{
  ok: boolean;
  error?: string;
  columnKey?: string;
}> {
  const staffId = await requireStaff();
  const [kind, id] = destination.split(":");
  if (!id || !["kennel", "station"].includes(kind)) return { ok: false, error: "Choose a kennel, bathing, or grooming station." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { staff: { select: { name: true, roles: true } }, kennel: { select: { stationId: true } } },
      });
      if (!appointment || (appointment.status !== AppointmentStatus.SCHEDULED && appointment.status !== AppointmentStatus.CHECKED_IN)) {
        return { ok: false as const, error: "This pet is no longer arriving or waiting. Refresh and try again." };
      }
      let stationId: string | null = null;
      let kennelId: string | null = null;
      let kennelStationId: string | null = null;
      let status: AppointmentStatus = AppointmentStatus.CHECKED_IN;
      let columnKey = "waiting";
      let destinationName = "";
      if (kind === "kennel") {
        const kennel = await tx.kennel.findUnique({ where: { id }, include: { station: true } });
        if (!kennel?.isActive || !kennel.station.isActive || kennel.station.role !== StationRole.KENNEL) {
          return { ok: false as const, error: "That kennel is not in service." };
        }
        const occupants = await tx.appointment.findMany({
          where: { kennelId: id, status: { in: KENNELABLE_STATUSES }, NOT: { id: appointmentId } },
          select: { customerId: true },
        });
        const limits = stationLimits(kennel.station);
        if (!compartmentRoom(occupants.map((pet) => pet.customerId), appointment.customerId, limits.perCompartment, limits.householdMax).ok) {
          return { ok: false as const, error: "That kennel is full. Choose another compartment." };
        }
        kennelId = id;
        kennelStationId = kennel.stationId;
        destinationName = `${kennel.station.name} · ${kennel.label}`;
      } else {
        const station = await tx.station.findUnique({ where: { id } });
        if (!station?.isActive || (station.role !== StationRole.BATHING && station.role !== StationRole.GROOMER)) {
          return { ok: false as const, error: "Choose an active bathing or grooming station." };
        }
        const roles = appointment.staff?.roles ?? [];
        if (station.allowedRoles.length && roles.length && !station.allowedRoles.some((role) => roles.includes(role))) {
          return { ok: false as const, error: `${appointment.staff?.name} cannot work ${station.name}.` };
        }
        const occupied = await tx.appointment.count({ where: { stationId: id, status: { in: OCCUPYING_STATUSES }, NOT: { id: appointmentId } } });
        if (occupied) return { ok: false as const, error: `${station.name} is already taken. Choose another station.` };
        stationId = id;
        destinationName = station.name;
        status = station.role === StationRole.BATHING ? AppointmentStatus.IN_PROGRESS : AppointmentStatus.FINISHING;
        columnKey = station.role === StationRole.BATHING ? "bath" : "grooming";
      }
      const now = new Date();
      const history = [];
      if (appointment.status === AppointmentStatus.SCHEDULED) {
        history.push({ status: AppointmentStatus.CHECKED_IN, changedById: staffId, note: `Checked in for ${destinationName}`, changedAt: now });
      }
      if (status !== AppointmentStatus.CHECKED_IN || appointment.status === AppointmentStatus.CHECKED_IN) {
        history.push({ status, changedById: staffId, note: `Assigned to ${destinationName}`, changedAt: now });
      }
      // These early stages have no pickup/reward side effects. Save placement,
      // check-in time and history together so a failed assignment changes nothing.
      await tx.appointment.update({ where: { id: appointmentId }, data: {
        status, stationId, kennelId, kenneledAt: kennelId ? now : null,
        checkedInAt: appointment.status === AppointmentStatus.SCHEDULED ? now : appointment.checkedInAt,
        statusHistory: { create: history },
      } });
      return { ok: true as const, columnKey, stationIds: [appointment.stationId, stationId], kennelStationIds: [appointment.kennel?.stationId, kennelStationId] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) return result;
    // A kiosk delivery failure must not report that a committed assignment failed.
    await Promise.allSettled([
      ...[...new Set(result.stationIds.filter((id): id is string => !!id))].map((id) => broadcastStationBoard(id)),
      ...[...new Set(result.kennelStationIds.filter((id): id is string => !!id))].map((id) => broadcastKennelBoard(id)),
    ]);
    for (const path of ["/staff", "/staff/stations", "/staff/appointments", `/staff/appointments/${appointmentId}`]) revalidatePath(path);
    return { ok: true, columnKey: result.columnKey };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, error: "Availability just changed. Please try again." };
    }
    throw error;
  }
}
