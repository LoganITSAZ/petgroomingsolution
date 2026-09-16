import { AppointmentStatus, AppointmentType, Prisma, ServiceType } from "@prisma/client";
import { resolveSelectedServices, sendBookingNotifications } from "@/lib/appointment-services";
import { validateBookingTime, type BookingRefusalCode } from "@/lib/booking-validation";
import { getConfig } from "@/lib/config";
import { kennelDemand } from "@/lib/kennels";
import { serviceFloorCents } from "@/lib/pricing";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";
import { prisma } from "@/lib/prisma";
import type { BusinessHours } from "@/lib/shop-hours";
import { defaultAssignment } from "@/lib/stations";
import {
  checksForPet,
  vaccinationBlockers,
  vaccinationRefusalMessage,
} from "@/lib/vaccinations";
import { shopDayRange } from "@/lib/utils";
import { learnedSlotForPet } from "@/lib/visit-duration";

/**
 * The one place an Appointment row is created.
 *
 * There were four: the staff form, the portal server action, the appointments
 * API and the walk-in route. Only the staff form checked anything at all — the
 * kennel — so the portal would take a booking for a day the shop is shut and a
 * walk-in arrived attached to nobody. Guarding each caller separately is four
 * diffs and four future regressions; this is one. All four call it now.
 *
 * `enforceCustomerRules` is the only difference between the paths. Staff skip
 * the lead time and the booking window — those are promises made to customers
 * on the public site, not rules about the shop's own diary — and skip the
 * kennel refusal, because a person standing at the counter is the shop's
 * problem to solve, not the software's to refuse.
 */

export const APPOINTMENT_INCLUDE = {
  pet: true,
  customer: true,
  station: true,
  staff: true,
  statusHistory: { orderBy: { changedAt: "asc" as const } },
} as const;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

export type CreateAppointmentInput = {
  customerId: string;
  petId: string;
  scheduledAt: Date;
  serviceIds?: string[];
  serviceType?: ServiceType;
  appointmentType?: AppointmentType;
  stationId?: string | null;
  staffId?: string | null;
  durationMins?: number | null;
  visitNotes?: string | null;
  needsKennel?: boolean;
  status?: AppointmentStatus;
  /** Customer-facing callers pass true: lead time, booking window, kennel space. */
  enforceCustomerRules: boolean;
  /** Staff id for the audit row; null for a customer-made booking. */
  changedById?: string | null;
  note?: string;
};

export type CreateAppointmentFailure = {
  ok: false;
  code:
    | BookingRefusalCode
    | "NOT_FOUND"
    | "BAD_ASSIGNMENT"
    | "PET_MISMATCH"
    | "NO_SERVICES"
    | "NO_KENNEL"
    | "VACCINATION_REQUIRED";
  message: string;
};

export type CreateAppointmentSuccess = { ok: true; appointment: AppointmentWithRelations };

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<CreateAppointmentSuccess | CreateAppointmentFailure> {
  const config = await getConfig();

  // A walk-in is already standing in the shop; refusing it for being outside
  // the booking window would be absurd. Its own window is checked by the
  // walk-in route, which owns that rule.
  const isWalkIn = input.appointmentType === AppointmentType.WALK_IN;
  if (!isWalkIn) {
    const refusal = validateBookingTime({
      scheduledAt: input.scheduledAt,
      hours: (config.businessHours as BusinessHours | null) ?? null,
      leadHours: config.bookingLeadHours,
      windowDays: config.bookingWindowDays,
      enforceWindow: input.enforceCustomerRules,
    });
    if (refusal) return { ok: false, code: refusal.code, message: refusal.message };
  }

  // A named station or groomer that does not exist is a bad request, not a
  // foreign-key crash. Checked here rather than in the API route because every
  // caller can name one and only the route ever guarded it.
  const [customer, pet, station, staff] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }),
    prisma.pet.findUnique({
      where: { id: input.petId },
      select: { id: true, name: true, customerId: true, isActive: true },
    }),
    input.stationId
      ? prisma.station.findUnique({ where: { id: input.stationId }, select: { id: true } })
      : null,
    input.staffId
      ? prisma.staff.findUnique({ where: { id: input.staffId }, select: { id: true } })
      : null,
  ]);
  if (!customer) return { ok: false, code: "NOT_FOUND", message: "Customer not found." };
  // A retired pet is not bookable. petId is client-controlled on every path,
  // and the dropdowns that offer it only list active pets.
  if (!pet || !pet.isActive) {
    return { ok: false, code: "NOT_FOUND", message: "Pet not found." };
  }
  // NOT_FOUND (the customer or the pet) is the thing being booked; a station
  // or groomer the caller named is part of the request body, so it stays a 400
  // like it was before this path was shared.
  if (input.stationId && !station) {
    return { ok: false, code: "BAD_ASSIGNMENT", message: "Station not found." };
  }
  if (input.staffId && !staff) {
    return { ok: false, code: "BAD_ASSIGNMENT", message: "Staff member not found." };
  }
  if (pet.customerId !== input.customerId) {
    return { ok: false, code: "PET_MISMATCH", message: "That pet belongs to someone else." };
  }

  /*
   * Shots. Only a customer-facing booking is refused, and only when the shop
   * asked for refusal — `enforceCustomerRules` already draws that line for the
   * booking window and the kennel. Staff at the counter see the same warning on
   * the visit screen and book anyway, because the owner is standing there with
   * the certificate in their hand.
   *
   * `checksForPet()` returns nothing when the feature is off or the shop has no
   * requirements, so this is one query on a shop that checks nothing.
   */
  if (input.enforceCustomerRules && config.vaccinationGateBlocks) {
    const blockers = vaccinationBlockers(await checksForPet(input.petId, config));
    if (blockers.length > 0) {
      return {
        ok: false,
        code: "VACCINATION_REQUIRED",
        message: vaccinationRefusalMessage(blockers, pet.name),
      };
    }
  }

  const resolved = await resolveSelectedServices(input.serviceIds ?? []);
  if (input.serviceIds?.length && !resolved) {
    return { ok: false, code: "NO_SERVICES", message: "No such services." };
  }

  // A visit carries line items or it is invisible to the service mix and to
  // revenue. When only a legacy serviceType was sent, stand in the catalog row
  // for that type. serviceId is nullable on the line, so a shop can retire a
  // catalog row while visits that used it stay on the books.
  let lines: {
    serviceId: string | null;
    serviceType: ServiceType;
    priceCents: number | null;
    sortOrder: number;
  }[] = resolved?.lines ?? [];
  const serviceType = resolved?.primaryType ?? input.serviceType;
  if (!serviceType) {
    return { ok: false, code: "NO_SERVICES", message: "Choose at least one service." };
  }

  if (lines.length === 0) {
    const catalogService = await prisma.service.findFirst({
      where: { type: serviceType, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    lines = [
      {
        serviceId: catalogService?.id ?? null,
        serviceType,
        priceCents: catalogService ? serviceFloorCents(catalogService) : null,
        sortOrder: 0,
      },
    ];
  }

  const needsKennel = input.needsKennel ?? true;

  // Somewhere to put the dog. Only customer-facing paths are refused: staff
  // booking over capacity are making a decision, not a mistake.
  if (needsKennel && input.enforceCustomerRules) {
    const { start, end } = shopDayRange(input.scheduledAt);
    const demand = await kennelDemand(start, end);
    if (demand.free <= 0) {
      return {
        ok: false,
        code: "NO_KENNEL",
        message: "The shop is full that day. Please pick another, or call us.",
      };
    }
  }

  // Bookings do not ask for a groomer or a station: the customer's preferred
  // groomer picks both, and the groomer's own station follows.
  //
  // Derived per FIELD, not per object. Naming a groomer while leaving the
  // station blank must still pick up that groomer's default station — the
  // station follows the person, which is the whole point of the rule. An
  // explicit value still wins for the field it was given for.
  const derived =
    input.staffId === undefined || input.stationId === undefined
      ? await defaultAssignment(input.customerId)
      : { staffId: null, stationId: null };

  const staffId = input.staffId === undefined ? derived.staffId : input.staffId;

  // The station follows the groomer, so a derived station is only right when
  // the derived groomer is the one actually taking the visit. Staff naming a
  // different groomer must not inherit the preferred groomer's table.
  const stationId =
    input.stationId === undefined
      ? staffId !== null && staffId === derived.staffId
        ? derived.stationId
        : null
      : input.stationId;

  const assignment = { staffId, stationId };

  // How long to book for. The catalog's flat sum is the starting point; a pet
  // with enough history of running over — or finishing early — moves it, which
  // is the one thing the shop already knew and never acted on. A caller that
  // named a duration is not second-guessed, and the figure stays editable on
  // the appointment afterwards.
  const baseDuration = input.durationMins ?? resolved?.totalDurationMins ?? null;
  const slot =
    input.durationMins == null && baseDuration != null
      ? await learnedSlotForPet(input.petId, baseDuration)
      : { mins: baseDuration, reason: null };

  // Snapshot the customer's negotiated rate onto the visit, so editing the
  // tier later never reprices what was quoted here.
  const rate = await bookingRateSnapshot(input.customerId, lines);
  const status = input.status ?? AppointmentStatus.SCHEDULED;

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        customerId: input.customerId,
        petId: input.petId,
        scheduledAt: input.scheduledAt,
        serviceType,
        appointmentType: input.appointmentType ?? AppointmentType.APPOINTMENT,
        stationId: assignment.stationId,
        staffId: assignment.staffId,
        durationMins: slot.mins,
        visitNotes: input.visitNotes ?? null,
        needsKennel,
        status,
        checkedInAt: status === AppointmentStatus.CHECKED_IN ? new Date() : null,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
        services: { create: lines },
      },
      include: APPOINTMENT_INCLUDE,
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: created.id,
        status,
        changedById: input.changedById ?? null,
        // The adjusted slot explains itself in the audit trail rather than
        // silently differing from what the price list says.
        note: [input.note ?? "Appointment created", slot.reason].filter(Boolean).join(" "),
      },
    });

    return created;
  });

  // Tell the customer, by whichever channels the shop runs. Both the portal
  // and the staff form called this themselves; POST /api/appointments and the
  // walk-in route never did, so those two booked people silently. Doing it
  // here is what makes that uniform.
  //
  // Non-fatal, always: a carrier outage or an unset RESEND_API_KEY must never
  // fail a booking. sendBookingNotifications() already swallows per-channel
  // failures; this catch covers the lookup around them.
  await sendBookingNotifications(appointment.id).catch(console.error);

  return { ok: true, appointment };
}
