import { prisma } from "@/lib/prisma";
import { STATION_APPOINTMENT_SELECT, broadcastToStation } from "@/lib/station-events";
import { broadcastKennelBoard, releaseKennelForAppointment } from "@/lib/kennels";
import { sendReadyForPickup } from "@/lib/email";
import { smsReadyForPickup } from "@/lib/sms";
import { voiceReadyForPickup } from "@/lib/voice";
import { getConfig } from "@/lib/config";
import { AppointmentStatus } from "@prisma/client";
import { formatVisitEvent } from "@/lib/utils";
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
      select: STATION_APPOINTMENT_SELECT,
      orderBy: { checkedInAt: "asc" },
    }),
  ]);
  if (!station) return;
  broadcastToStation(stationId, { type: "status_update", appointments, station });
}

/**
 * What the groomer ticked as the owner's to hear about, in the order it
 * happened. A finding with no note still says something — the type alone tells
 * the owner there is something to ask about at the counter.
 */
async function ownerVisibleFindings(appointmentId: string): Promise<string[]> {
  const events = await prisma.visitEvent.findMany({
    where: { appointmentId, ownerVisible: true },
    select: { eventType: true, note: true },
    orderBy: { occurredAt: "asc" },
  });
  return events.map((event) =>
    event.note?.trim() ? `${formatVisitEvent(event.eventType)}: ${event.note.trim()}` : formatVisitEvent(event.eventType)
  );
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
      customer: {
        select: {
          firstName: true, lastName: true, phone: true, email: true,
          smsOptOut: true, voiceOptOut: true,
        },
      },
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

  // Notification failures must never fail the status change. Both channels are
  // tried: the shop switches each on independently, and a customer who reads
  // neither email nor text is no reason for the pet to sit uncollected.
  if (status === AppointmentStatus.READY_PICKUP) {
    const findings = await ownerVisibleFindings(updated.id);
    // Linked, not attached: the bytes stay behind /api/photos/[id].
    const sharedPhotos = await prisma.visitPhoto.count({
      where: { appointmentId: updated.id, ownerVisible: true },
    });

    if (updated.customer.email) {
      await sendReadyForPickup({
        to: updated.customer.email,
        ownerName: `${updated.customer.firstName} ${updated.customer.lastName}`,
        petName: updated.pet.name,
        findings,
        hasPhotos: sharedPhotos > 0,
      }).catch(console.error);
    }

    if (updated.customer.phone && !updated.customer.smsOptOut) {
      const config = await getConfig();
      await smsReadyForPickup({
        to: updated.customer.phone,
        petName: updated.pet.name,
        shopName: config.shopName,
        phone: config.shopPhone,
        hasFindings: findings.length > 0,
      }).catch(console.error);
    }

    // The oldest notification a grooming shop has: the phone rings and somebody
    // says the dog is done. Its own flag and its own opt-out, so a household
    // that only wants a text still only gets one.
    if (updated.customer.phone && !updated.customer.voiceOptOut) {
      const config = await getConfig();
      await voiceReadyForPickup({
        to: updated.customer.phone,
        petName: updated.pet.name,
        shopName: config.shopName,
      }).catch(console.error);
    }
  }

  return updated;
}
