import { prisma } from "@/lib/prisma";
import { KIOSK_APPOINTMENT_SELECT, broadcastToStation } from "@/lib/station-events";
import { broadcastKennelBoard, releaseKennelForAppointment } from "@/lib/kennels";
import { sendReadyForPickup } from "@/lib/email";
import { AppointmentStatus } from "@prisma/client";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { syncRewardForVisit } from "@/lib/rewards";

/**
 * One place where a status change happens, so the API route, the kiosk and the
 * staff screens all produce the same side effects: an audit row, the station
 * display refresh, the kennel release, and the pickup email.
 */

/** A pet that has left, or never arrived, holds nothing. */
const RELEASES_KENNEL: AppointmentStatus[] = [
  AppointmentStatus.PICKED_UP,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

/**
 * Repaint one station's kiosk.
 *
 * Sends the station's whole list, because several pets can stand at one
 * station and a single appointment is not enough to redraw the screen. Called
 * after a status change and after a pet is moved between stations — both
 * change what that screen should be showing.
 */
export async function broadcastStationBoard(stationId: string): Promise<void> {
  const [station, appointments] = await Promise.all([
    prisma.station.findUnique({ where: { id: stationId } }),
    prisma.appointment.findMany({
      where: { stationId, status: { in: OCCUPYING_STATUSES } },
      select: KIOSK_APPOINTMENT_SELECT,
      orderBy: { checkedInAt: "asc" },
    }),
  ]);
  if (!station) return;
  broadcastToStation(stationId, { type: "status_update", appointments, station });
}

export async function changeAppointmentStatus({
  appointmentId,
  status,
  note,
  staffId,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  note?: string;
  staffId?: string | null;
}) {
  const now = new Date();

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      checkedInAt: status === AppointmentStatus.CHECKED_IN ? now : undefined,
      completedAt: status === AppointmentStatus.COMPLETE ? now : undefined,
      statusHistory: {
        create: { status, note, changedById: staffId ?? undefined },
      },
    },
    include: {
      pet: true,
      customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
      staff: { select: { name: true } },
      station: true,
    },
  });

  if (updated.stationId) await broadcastStationBoard(updated.stationId);

  // The punch card follows the visit: finishing earns one, cancelling or a
  // no-show takes it back. Idempotent, so the three finished statuses in a row
  // still only ever earn one.
  await syncRewardForVisit(updated.id, updated.customerId, status);

  if (RELEASES_KENNEL.includes(status)) {
    const freedStationId = await releaseKennelForAppointment(updated.id);
    if (freedStationId) await broadcastKennelBoard(freedStationId);
  }

  // Notification failures must never fail the status change.
  if (status === AppointmentStatus.READY_PICKUP && updated.customer.email) {
    await sendReadyForPickup({
      to: updated.customer.email,
      ownerName: `${updated.customer.firstName} ${updated.customer.lastName}`,
      petName: updated.pet.name,
    }).catch(console.error);
  }

  return updated;
}
