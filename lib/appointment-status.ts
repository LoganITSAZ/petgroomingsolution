import { prisma } from "@/lib/prisma";
import { KIOSK_APPOINTMENT_SELECT, broadcastToStation } from "@/lib/station-events";
import { broadcastKennelBoard, releaseKennelForAppointment } from "@/lib/kennels";
import { sendReadyForPickup } from "@/lib/email";
import { AppointmentStatus } from "@prisma/client";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { syncRewardForVisit } from "@/lib/rewards";

export { STATUS_FLOW, nextStatus } from "@/lib/appointment-flow";

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

  if (updated.stationId) {
    // Send the station's whole list: with several pets at one station, a single
    // appointment is not enough to repaint the screen.
    const appointments = await prisma.appointment.findMany({
      where: { stationId: updated.stationId, status: { in: OCCUPYING_STATUSES } },
      select: KIOSK_APPOINTMENT_SELECT,
      orderBy: { checkedInAt: "asc" },
    });

    broadcastToStation(updated.stationId, {
      type: "status_update",
      appointments,
      station: updated.station,
    });
  }

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
