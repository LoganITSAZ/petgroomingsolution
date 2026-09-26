import { prisma } from "@/lib/prisma";
import { STATION_APPOINTMENT_SELECT, broadcastToStation } from "@/lib/station-events";
import { broadcastKennelBoard, releaseKennelForAppointment } from "@/lib/kennels";
import { sendReadyForPickup } from "@/lib/email";
import { smsReadyForPickup } from "@/lib/sms";
import { voiceReadyForPickup } from "@/lib/voice";
import { getConfig } from "@/lib/config";
import { AppointmentStatus } from "@prisma/client";
import { formatVisitEvent, shopDayRange } from "@/lib/utils";
import { householdReadyToTell } from "@/lib/visit-time";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { syncRewardForVisit } from "@/lib/rewards";

/**
 * One place where a status change happens, so the API route, the kiosk and the
 * staff screens all produce the same side effects: an audit row, the station
 * display refresh, the kennel release, and — once the last dog of a household
 * is done — the message telling the owner.
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

type StatusChange = {
  appointmentId: string;
  status: AppointmentStatus;
  note?: string;
  staffId?: string | null;
};

/** The change and its side effects on the floor. Tells nobody. */
async function applyStatus({ appointmentId, status, note, staffId }: StatusChange) {
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

  return updated;
}

/**
 * Dogs from one home go home together, so the owner is told once, when the
 * last of them is done. Runs after every change, which is what lets a sibling
 * cancelled or marked a no-show release the dogs waiting on it. Returns the
 * visits it moved.
 */
async function tellHouseholdIfReady(
  visit: { customerId: string; scheduledAt: Date },
  staffId?: string | null
): Promise<string[]> {
  const { start, end } = shopDayRange(visit.scheduledAt);
  const household = await prisma.appointment.findMany({
    where: { customerId: visit.customerId, scheduledAt: { gte: start, lt: end } },
    select: { id: true, status: true },
  });
  const ready = householdReadyToTell(household);
  for (const id of ready) {
    await applyStatus({ appointmentId: id, status: AppointmentStatus.READY_PICKUP, note: "Household finished", staffId });
  }
  return ready;
}

/**
 * One email, one text and one call for every dog that just became ready.
 * Notification failures must never fail the status change. Every channel is
 * tried: the shop switches each on independently, and a customer who reads
 * neither email nor text is no reason for the pet to sit uncollected.
 */
async function notifyReady(
  customer: {
    firstName: string; lastName: string; phone: string | null; email: string | null;
    smsOptOut: boolean; voiceOptOut: boolean;
  },
  appointmentIds: string[]
) {
  const visits = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds } },
    select: { id: true, pet: { select: { name: true } } },
    orderBy: { checkedInAt: "asc" },
  });
  const pets = visits.map((visit) => visit.pet.name);
  // With more than one dog, a finding has to say whose ear it was.
  const findings = (
    await Promise.all(
      visits.map(async (visit) =>
        (await ownerVisibleFindings(visit.id)).map((finding) => (visits.length > 1 ? `${visit.pet.name}: ${finding}` : finding))
      )
    )
  ).flat();
  // Linked, not attached: the bytes stay behind /api/photos/[id].
  const sharedPhotos = await prisma.visitPhoto.count({
    where: { appointmentId: { in: appointmentIds }, ownerVisible: true },
  });

  if (customer.email) {
    await sendReadyForPickup({
      to: customer.email,
      ownerName: `${customer.firstName} ${customer.lastName}`,
      pets,
      findings,
      hasPhotos: sharedPhotos > 0,
    }).catch(console.error);
  }

  const config = await getConfig();

  if (customer.phone && !customer.smsOptOut) {
    await smsReadyForPickup({
      to: customer.phone,
      pets,
      shopName: config.shopName,
      phone: config.shopPhone,
      hasFindings: findings.length > 0,
    }).catch(console.error);
  }

  // The oldest notification a grooming shop has: the phone rings and somebody
  // says the dog is done. Its own flag and its own opt-out, so a household
  // that only wants a text still only gets one.
  if (customer.phone && !customer.voiceOptOut) {
    await voiceReadyForPickup({
      to: customer.phone,
      pets,
      shopName: config.shopName,
    }).catch(console.error);
  }
}

export async function changeAppointmentStatus(change: StatusChange) {
  const before = await prisma.appointment.findUnique({
    where: { id: change.appointmentId },
    select: { status: true },
  });
  const updated = await applyStatus(change);
  const told = await tellHouseholdIfReady(updated, change.staffId);

  // Only a visit that moved is news: a re-save of ready-for-pickup, or a
  // sibling already told, sends nothing. The manual action still tells the
  // owner early by hand.
  const pressedReady =
    change.status === AppointmentStatus.READY_PICKUP && before?.status !== AppointmentStatus.READY_PICKUP;
  const moved = pressedReady ? [updated.id, ...told] : told;
  if (moved.length) await notifyReady(updated.customer, moved);

  return told.includes(updated.id) ? { ...updated, status: AppointmentStatus.READY_PICKUP } : updated;
}
