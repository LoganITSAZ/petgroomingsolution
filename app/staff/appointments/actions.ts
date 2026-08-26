"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { broadcastStationBoard, changeAppointmentStatus } from "@/lib/appointment-status";
import { BOARD_COLUMNS, nextStatus } from "@/lib/appointment-flow";
import { resolveSelectedServices, setAppointmentServices } from "@/lib/appointment-services";
import { broadcastKennelBoard, kennelHasRoom, KENNELABLE_STATUSES } from "@/lib/kennels";
import { AppointmentStatus, StationRole, VisitEventType } from "@prisma/client";
import { isFloorStaff } from "@/lib/utils";
import { OCCUPYING_STATUSES, stationHasRoom } from "@/lib/stations";
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

/**
 * Move a pet to a station, or off every station.
 *
 * Called from the board's drag-and-drop, so it answers rather than redirects —
 * a refused drop has to say why beside the pet that was dragged. Every rule
 * the detail screen's form enforces is enforced here too: a drop is its own
 * endpoint, and the board only ever showed what was true when the page loaded.
 */
export async function assignStation(
  appointmentId: string,
  stationId: string | null
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { stationId: true, status: true, staff: { select: { name: true, roles: true } } },
  });
  if (!appointment) return { ok: false, error: "That visit no longer exists." };
  if (stationId === appointment.stationId) return { ok: true };

  if (stationId) {
    if (!OCCUPYING_STATUSES.includes(appointment.status)) {
      return { ok: false, error: "Only a pet that is in the shop can stand at a station." };
    }

    const station = await prisma.station.findUnique({
      where: { id: stationId },
      select: { name: true, isActive: true, role: true, allowedRoles: true },
    });
    if (!station || !station.isActive) return { ok: false, error: "That station is not in service." };
    // Kennels are filled door by door, on the stations screen.
    if (station.role === StationRole.KENNEL) {
      return { ok: false, error: "Kennel doors are assigned on the stations screen." };
    }

    const roles = appointment.staff?.roles ?? [];
    if (
      station.allowedRoles.length > 0 &&
      roles.length > 0 &&
      !station.allowedRoles.some((role) => roles.includes(role))
    ) {
      return { ok: false, error: `${appointment.staff?.name} cannot work ${station.name}.` };
    }

    if (!(await stationHasRoom(stationId, appointmentId))) {
      return { ok: false, error: `${station.name} is already taken.` };
    }
  }

  await prisma.appointment.update({ where: { id: appointmentId }, data: { stationId } });

  // Both screens change: the one the pet left and the one it arrived at.
  if (appointment.stationId) await broadcastStationBoard(appointment.stationId);
  if (stationId) await broadcastStationBoard(stationId);

  revalidatePath("/staff/appointments");
  revalidatePath("/staff/stations");
  revalidatePath("/staff");
  return { ok: true };
}


/**
 * Move a pet to a column on the floor board.
 *
 * One gesture, two changes: the visit takes the column's status and the pet is
 * stood at a free station of the column's kind. The board is five stages now,
 * not seven stations, so "which bath" is the board's problem rather than the
 * counter's — it takes the first free one in name order, which is how the shop
 * fills them anyway.
 *
 * Order matters here. The station is found and checked *before* the status
 * changes, so a refused move leaves the visit exactly where it was rather than
 * advancing it into a stage with nowhere to stand. Statuses still go through
 * changeAppointmentStatus(), which writes the audit row, refreshes the kiosk,
 * frees the kennel on a terminal status and sends the pickup email.
 *
 * A shop with no station of that kind is not blocked: plenty of shops dry on
 * the groom table, so an empty role means the stage advances with no station
 * to stand at. Only a role whose stations are all full refuses.
 */
export async function moveToColumn(
  appointmentId: string,
  columnKey: string
): Promise<{ ok: boolean; error?: string }> {
  const staffId = await requireStaff();

  const column = BOARD_COLUMNS.find((candidate) => candidate.key === columnKey);
  if (!column) return { ok: false, error: "That column no longer exists." };

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      status: true,
      stationId: true,
      staff: { select: { name: true, roles: true } },
    },
  });
  if (!appointment) return { ok: false, error: "That visit no longer exists." };

  const alreadyHere =
    column.status === appointment.status || column.alsoHolds.includes(appointment.status);

  let stationId: string | null = null;

  if (column.stationRole) {
    // Staying put keeps the station the pet is already on, so a pet nudged
    // within its own column is not shuffled onto a different table.
    const stations = await prisma.station.findMany({
      where: { isActive: true, role: column.stationRole },
      select: { id: true, name: true, allowedRoles: true },
      orderBy: { name: "asc" },
    });

    if (stations.length > 0) {
      const roles = appointment.staff?.roles ?? [];
      const workable = stations.filter(
        (station) =>
          station.allowedRoles.length === 0 ||
          roles.length === 0 ||
          station.allowedRoles.some((role) => roles.includes(role))
      );

      if (workable.length === 0) {
        return {
          ok: false,
          error: `${appointment.staff?.name} cannot work any ${column.label.toLowerCase()} station.`,
        };
      }

      const keeping = workable.find((station) => station.id === appointment.stationId);
      if (keeping) {
        stationId = keeping.id;
      } else {
        for (const station of workable) {
          if (await stationHasRoom(station.id, appointmentId)) {
            stationId = station.id;
            break;
          }
        }
        if (!stationId) {
          return { ok: false, error: `Every ${column.label.toLowerCase()} station is taken.` };
        }
      }
    }
  }

  if (alreadyHere && stationId === appointment.stationId) return { ok: true };

  if (stationId !== appointment.stationId) {
    await prisma.appointment.update({ where: { id: appointmentId }, data: { stationId } });
    // Both kiosks change: the one the pet left and the one it arrived at.
    if (appointment.stationId) await broadcastStationBoard(appointment.stationId);
    if (stationId) await broadcastStationBoard(stationId);
  }

  if (!alreadyHere) {
    await changeAppointmentStatus({ appointmentId, status: column.status, staffId });
  }

  revalidatePath("/staff/appointments");
  revalidatePath("/staff/stations");
  revalidatePath("/staff");
  return { ok: true };
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
