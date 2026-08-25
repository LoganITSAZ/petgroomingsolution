"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { changeAppointmentStatus, nextStatus } from "@/lib/appointment-status";
import { resolveSelectedServices, setAppointmentServices } from "@/lib/appointment-services";
import { broadcastKennelBoard, kennelHasRoom, KENNELABLE_STATUSES } from "@/lib/kennels";
import { AppointmentStatus, VisitEventType } from "@prisma/client";
import { isFloorStaff } from "@/lib/utils";
import { stationHasRoom } from "@/lib/stations";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function back(appointmentId: string, params = ""): never {
  revalidatePath(`/staff/appointments/${appointmentId}`);
  revalidatePath("/staff/appointments");
  revalidatePath("/staff");
  redirect(`/staff/appointments/${appointmentId}${params}`);
}

/** Advance one step along the groom flow, or set an explicit status. */
export async function moveStatus(formData: FormData): Promise<void> {
  const staffId = await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const requested = (formData.get("status") as string | null) ?? "";
  const note = ((formData.get("note") as string | null) ?? "").trim() || undefined;
  const returnTo = (formData.get("returnTo") as string | null) ?? "";

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  const target = requested
    ? Object.values(AppointmentStatus).includes(requested as AppointmentStatus)
      ? (requested as AppointmentStatus)
      : null
    : nextStatus(appointment.status);

  if (!target) back(appointmentId, "?error=no_next_status");
  if (target === appointment.status) back(appointmentId, "?error=already_there");

  await changeAppointmentStatus({ appointmentId, status: target, note, staffId });

  // The list view sends staff straight back to the list they were working.
  if (returnTo === "list") {
    revalidatePath("/staff/appointments");
    revalidatePath("/staff");
    redirect(`/staff/appointments${(formData.get("listQuery") as string | null) ?? ""}`);
  }
  back(appointmentId, "?moved=1");
}

/**
 * Check-in, with the kennel chosen in the same step.
 *
 * Arrival is where the workflow starts: the pet is marked in, and put straight
 * into a compartment so the floor knows where it is.
 */
export async function checkInWithKennel(formData: FormData): Promise<void> {
  const staffId = await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const kennelId = ((formData.get("kennelId") as string | null) ?? "").trim();
  const listQuery = (formData.get("listQuery") as string | null) ?? "";

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { status: true },
  });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  if (appointment.status !== AppointmentStatus.CHECKED_IN) {
    await changeAppointmentStatus({
      appointmentId,
      status: AppointmentStatus.CHECKED_IN,
      note: kennelId ? "Checked in and kennelled" : "Checked in",
      staffId,
    });
  }

  if (kennelId) {
    const kennel = await prisma.kennel.findUnique({ where: { id: kennelId } });
    if (kennel && kennel.isActive && (await kennelHasRoom(kennel.id, appointmentId))) {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { kennelId: kennel.id, kenneledAt: new Date() },
      });
      await broadcastKennelBoard(kennel.stationId);
    } else {
      // The pet is checked in either way; say why it is not behind a door.
      revalidatePath("/staff/appointments");
      redirect(`/staff/appointments/${appointmentId}?error=kennel_occupied`);
    }
  }

  revalidatePath("/staff/appointments");
  revalidatePath("/staff");
  redirect(`/staff/appointments${listQuery}`);
}

/** Groomer, station and scheduling all change together on the detail screen. */
export async function updateAssignment(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  const staffId = ((formData.get("staffId") as string | null) ?? "").trim() || null;
  const stationId = ((formData.get("stationId") as string | null) ?? "").trim() || null;
  const scheduledAtRaw = ((formData.get("scheduledAt") as string | null) ?? "").trim();
  const durationRaw = ((formData.get("durationMins") as string | null) ?? "").trim();

  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) back(appointmentId, "?error=bad_date");

  const durationMins = durationRaw ? Number(durationRaw) : null;
  if (durationMins != null && (!Number.isInteger(durationMins) || durationMins <= 0)) {
    back(appointmentId, "?error=bad_duration");
  }

  // Only people who work the floor can hold a pet, and a station may narrow
  // that further. Both are enforced here, not only in the dropdown.
  if (staffId) {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { roles: true, isActive: true },
    });
    if (!staff || !staff.isActive || !isFloorStaff(staff.roles)) {
      back(appointmentId, "?error=not_floor_staff");
    }

    if (stationId) {
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        select: { allowedRoles: true },
      });
      const allowed = station?.allowedRoles ?? [];
      if (allowed.length > 0 && !allowed.some((role) => staff.roles.includes(role))) {
        back(appointmentId, "?error=role_not_allowed");
      }
    }
  }

  // A station holds a fixed number of pets; moving a pet that is already there
  // does not count against it.
  if (stationId && stationId !== appointment.stationId) {
    if (!(await stationHasRoom(stationId, appointmentId))) {
      back(appointmentId, "?error=station_full");
    }
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      staffId,
      stationId,
      durationMins,
      ...(scheduledAt ? { scheduledAt } : {}),
      visitNotes: ((formData.get("visitNotes") as string | null) ?? "").trim() || null,
      needsKennel: true,
    },
  });

  back(appointmentId, "?saved=1");
}

/** Replace the services booked on this visit. */
export async function updateServices(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const services = await resolveSelectedServices(
    formData.getAll("serviceIds").map((value) => String(value))
  );
  if (!services) back(appointmentId, "?error=no_services");

  await setAppointmentServices(appointmentId, services);
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { serviceType: services.primaryType },
  });

  back(appointmentId, "?services=1");
}

/** Put the pet in a kennel, or take it out, without leaving the visit. */
export async function moveToKennel(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const kennelId = ((formData.get("kennelId") as string | null) ?? "").trim();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { status: true, kennelId: true, kennel: { select: { stationId: true } } },
  });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  const previousStationId = appointment.kennel?.stationId ?? null;

  // Empty selection takes the pet out of whatever door it is in.
  if (!kennelId) {
    if (appointment.kennelId) {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { kennelId: null, kenneledAt: null },
      });
      if (previousStationId) await broadcastKennelBoard(previousStationId);
    }
    back(appointmentId, "?kennel=cleared");
  }

  if (!KENNELABLE_STATUSES.includes(appointment.status)) {
    back(appointmentId, "?error=not_in_shop");
  }

  const kennel = await prisma.kennel.findUnique({ where: { id: kennelId } });
  if (!kennel) back(appointmentId, "?error=kennel_missing");
  if (!kennel.isActive) back(appointmentId, "?error=kennel_out_of_service");
  if (!(await kennelHasRoom(kennel.id, appointmentId))) {
    back(appointmentId, "?error=kennel_occupied");
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { kennelId: kennel.id, kenneledAt: new Date() },
  });

  await broadcastKennelBoard(kennel.stationId);
  if (previousStationId && previousStationId !== kennel.stationId) {
    await broadcastKennelBoard(previousStationId);
  }

  back(appointmentId, "?kennel=1");
}

/**
 * Log what happened mid-groom. A bite is a safety signal, so it also raises
 * the pet's permanent bite flag that the kiosk banners.
 */
export async function logVisitEvent(formData: FormData): Promise<void> {
  const staffId = await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const eventTypeRaw = (formData.get("eventType") as string | null) ?? "";
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  if (!Object.values(VisitEventType).includes(eventTypeRaw as VisitEventType)) {
    back(appointmentId, "?error=bad_event");
  }
  const eventType = eventTypeRaw as VisitEventType;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, petId: true },
  });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  await prisma.visitEvent.create({
    data: { appointmentId, eventType, note, loggedById: staffId },
  });

  if (eventType === VisitEventType.BITE) {
    await prisma.pet.update({
      where: { id: appointment.petId },
      data: { hasBiteHistory: true },
    });
    revalidatePath(`/staff/pets/${appointment.petId}`);
  }

  back(appointmentId, "?event=1");
}
