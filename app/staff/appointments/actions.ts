"use server";

import { prisma } from "@/lib/prisma";
import { requireFeature, requireStaff } from "@/lib/auth-guards";
import { broadcastStationBoard, changeAppointmentStatus } from "@/lib/appointment-status";
import { BOARD_COLUMNS, nextStatus } from "@/lib/appointment-flow";
import { resolveSelectedServices, setAppointmentServices } from "@/lib/appointment-services";
import { broadcastKennelBoard, kennelHasRoom, KENNELABLE_STATUSES } from "@/lib/kennels";
import { AppointmentStatus, StationRole, VisitEventType } from "@prisma/client";
import { isFloorStaff } from "@/lib/utils";
import { shopDateTimeLocal } from "@/lib/shop-time";
import { OCCUPYING_STATUSES, stationHasRoom } from "@/lib/stations";
import { getConfig } from "@/lib/config";
import { deletePhotoIfUnused, storePhoto } from "@/lib/photos";
import { readKind } from "@/lib/visit-photos";
import { sendConsentRequest } from "@/lib/email";
import { smsConsentRequest } from "@/lib/sms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function back(appointmentId: string, params = "", returnTo?: string | null): never {
  revalidatePath(`/staff/appointments/${appointmentId}`);
  revalidatePath("/staff/appointments");
  revalidatePath("/staff");
  // A groomer who logged this from the station job aid goes back to the table,
  // not to the counter's screen. Only our own paths: an open redirect through
  // a form field is not worth the convenience.
  if (returnTo?.startsWith("/staff/")) {
    revalidatePath(returnTo);
    redirect(`${returnTo}${params}`);
  }
  redirect(`/staff/appointments/${appointmentId}${params}`);
}

/** Where a form wants to land again, if it said. */
function returnTo(formData: FormData): string | null {
  return (formData.get("returnTo") as string | null) ?? null;
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

  // Shop wall clock off the form, never the server's zone.
  const scheduledAt = scheduledAtRaw ? shopDateTimeLocal(scheduledAtRaw) : null;
  if (scheduledAtRaw && !scheduledAt) back(appointmentId, "?error=bad_date");

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
    back(appointmentId, "?error=bad_event", returnTo(formData));
  }
  const eventType = eventTypeRaw as VisitEventType;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, petId: true },
  });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  await prisma.visitEvent.create({
    data: {
      appointmentId,
      eventType,
      note,
      loggedById: staffId,
      // Ticked by the groomer logging it. What is ticked rides along with the
      // ready-for-pickup message instead of relying on someone remembering to
      // say it at the counter.
      ownerVisible: formData.get("ownerVisible") != null,
    },
  });

  if (eventType === VisitEventType.BITE) {
    await prisma.pet.update({
      where: { id: appointment.petId },
      data: { hasBiteHistory: true },
    });
    revalidatePath(`/staff/pets/${appointment.petId}`);
  }

  back(appointmentId, "?event=1", returnTo(formData));
}

/**
 * Write down what the pet was actually groomed with.
 *
 * Kept on the visit rather than the pet: this is what happened on the day, and
 * the next groomer reads it as the last thing that was done, not as a standing
 * instruction. Standing instructions are `Pet.groomingNotes`.
 */
export async function saveGroomRecord(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const text = (name: string) =>
    ((formData.get(name) as string | null) ?? "").trim() || null;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      groomBlade: text("groomBlade"),
      groomShampoo: text("groomShampoo"),
      groomRecordNotes: text("groomRecordNotes"),
    },
  });

  back(appointmentId, "?record=1");
}

/**
 * Ask the owner to approve a change to the groom they booked — matting that
 * has to come off, a coat that cannot be brushed out.
 *
 * The answer comes back by phone or at the door, and staff record it below.
 * There is no inbound message handling: a reply webhook needs a public
 * callback URL and signature verification, which is its own piece of work, and
 * a shave-down is a conversation the shop wants to have anyway.
 */
export async function requestConsent(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const consentNote = ((formData.get("consentNote") as string | null) ?? "").trim();
  if (!consentNote) back(appointmentId, "?error=no_consent_note", returnTo(formData));

  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      consentNote,
      consentRequestedAt: new Date(),
      // Asking again clears the previous answer: the owner is being asked
      // about something new, and a stale yes must not read as covering it.
      consentGrantedAt: null,
      consentDeclinedAt: null,
    },
    include: {
      pet: { select: { name: true } },
      customer: { select: { firstName: true, email: true, phone: true, smsOptOut: true } },
    },
  });

  const config = await getConfig();

  // Same rule as every other send in the app: a carrier or mailbox problem
  // must never fail the write. The request is recorded either way, and the
  // groomer can pick up the phone.
  if (appointment.customer.email) {
    await sendConsentRequest({
      to: appointment.customer.email,
      ownerName: appointment.customer.firstName,
      petName: appointment.pet.name,
      note: consentNote,
    }).catch(console.error);
  }
  if (appointment.customer.phone && !appointment.customer.smsOptOut) {
    await smsConsentRequest({
      to: appointment.customer.phone,
      petName: appointment.pet.name,
      shopName: config.shopName,
      phone: config.shopPhone,
    }).catch(console.error);
  }

  back(appointmentId, "?consent=1", returnTo(formData));
}

/** Record the answer the owner gave. */
export async function recordConsent(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const answer = (formData.get("answer") as string | null) ?? "";
  if (answer !== "granted" && answer !== "declined") {
    back(appointmentId, "?error=bad_consent_answer");
  }

  const now = new Date();
  await prisma.appointment.update({
    where: { id: appointmentId },
    // Both columns are written every time, so the pair always reflects one
    // answer rather than leaving an earlier contradicting one behind it.
    data: {
      consentGrantedAt: answer === "granted" ? now : null,
      consentDeclinedAt: answer === "declined" ? now : null,
    },
  });

  back(appointmentId, "?answered=1");
}

/**
 * Add a photo of this visit.
 *
 * Staff only, and never the owner: an owner sending photos in is inbound media
 * with moderation attached, and nobody asked for it. The bytes go where every
 * other photo in this app goes -- a `Photo` row behind /api/photos/[id], capped
 * and type-checked by `storePhoto()`.
 */
export async function addVisitPhoto(formData: FormData): Promise<void> {
  const staffId = await requireStaff();
  // A server action is its own endpoint, so hiding the uploader is not the
  // gate. This is.
  await requireFeature("featureVisitPhotos");

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const kind = readKind(formData.get("kind"));
  if (!kind) back(appointmentId, "?error=bad_photo_kind");

  const stored = await storePhoto(formData.get("photo"));
  if (!stored) back(appointmentId, "?error=no_photo");
  if ("error" in stored) back(appointmentId, `?error=photo_${stored.error}`);

  await prisma.visitPhoto.create({
    data: {
      appointmentId,
      photoId: stored.id,
      kind,
      caption: ((formData.get("caption") as string | null) ?? "").trim() || null,
      // Opt-in, like a visit event: an issue photo is often the shop's own
      // evidence rather than something to send the owner.
      ownerVisible: formData.get("ownerVisible") != null,
      takenById: staffId,
    },
  });

  back(appointmentId, "?photo=1");
}

/** Show this photo to the owner, or stop showing it. */
export async function setVisitPhotoVisibility(formData: FormData): Promise<void> {
  await requireStaff();
  await requireFeature("featureVisitPhotos");

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const id = (formData.get("photoRowId") as string | null) ?? "";

  await prisma.visitPhoto.update({
    where: { id },
    data: { ownerVisible: formData.get("ownerVisible") != null },
  });

  back(appointmentId, "?photo=1");
}

/**
 * Remove a photo from the visit.
 *
 * The row goes; the bytes go only if nothing else points at them, which is
 * `deletePhotoIfUnused()`'s decision and not this action's.
 */
export async function deleteVisitPhoto(formData: FormData): Promise<void> {
  await requireStaff();
  await requireFeature("featureVisitPhotos");

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const id = (formData.get("photoRowId") as string | null) ?? "";

  const row = await prisma.visitPhoto.delete({ where: { id } }).catch(() => null);
  if (row) await deletePhotoIfUnused(row.photoId);

  back(appointmentId, "?photoRemoved=1");
}
