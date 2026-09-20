import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { AppointmentStatus, StaffRole, VisitEventType, VisitPhotoKind } from "@prisma/client";
import { WORK_STATION_ROLES } from "@/lib/stations";
import { nextStatus } from "@/lib/appointment-flow";
import { getServiceOptions } from "@/lib/appointment-services";
import {
  KENNELABLE_STATUSES,
  compartmentRoom,
  LIMIT_SELECT,
  stationLimits,
} from "@/lib/kennels";
import { formatCents } from "@/lib/pricing";
import { rewardCard } from "@/lib/rewards";
import {
  formatServiceType,
  formatShopDate,
  formatRole,
  formatShopTime,
  formatSpecies,
  formatStatus,
  formatVisitEvent,
  statusBadgeClass,
} from "@/lib/utils";
import {
  ARRIVAL_CLASS,
  ARRIVAL_LABEL,
  arrivalLevel,
  arrivalThresholds,
  minutesLate,
} from "@/lib/arrivals";
import { shopDateTimeLocalValue } from "@/lib/shop-time";
import ServicePicker from "@/components/ServicePicker";
import PhotoStack from "@/components/PhotoStack";
import InsightList from "@/components/InsightList";
import { customerInsights, petInsights } from "@/lib/insights";
import { photoUrl } from "@/lib/photos";
import { consentState, groomRecordSummary, lastGroomRecordForPet } from "@/lib/visit-record";
import VisitPhotoStrip from "@/components/VisitPhotoStrip";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { ticketFromRow } from "@/lib/ticket";
import { TicketPanel } from "@/components/Ticket";
import { checksForPet } from "@/lib/vaccinations";
import { addOnPromptsFor } from "@/lib/add-ons";
import { VaccinationWarning } from "@/components/Vaccinations";
import { BLADE_TERMS } from "@/lib/resources";
import { redeemCustomerReward } from "@/app/staff/customers/actions";
import {
  addVisitPhoto,
  deleteVisitPhoto,
  logVisitEvent,
  moveStatus,
  recordConsent,
  requestConsent,
  saveGroomRecord,
  setVisitPhotoVisibility,
  moveToKennel,
  updateAssignment,
  updateServices,
} from "../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Visit" };

/**
 * Everything staff need for one visit in one place: move it through the groom,
 * assign who and where, change the services, park it in a kennel, log what
 * happened, and read the audit trail.
 */


const NOTICES: Record<string, string> = {
  moved: "Status updated.",
  saved: "Appointment saved.",
  services: "Services updated.",
  event: "Visit event logged.",
  record: "Groom record saved.",
  consent: "Consent request sent to the owner.",
  answered: "The owner's answer has been recorded.",
  redeemed: "Reward applied to this bill.",
  photo: "Visit photos updated.",
  photoRemoved: "Photo removed from this visit.",
  surcharged: "Fee added to the ticket.",
  unsurcharged: "Fee taken off the ticket.",
  paid: "Payment recorded.",
  unpaid: "Payment removed.",
};

/** A visit past these is closed: its bill is no longer open to a discount. */
const SETTLED_FOR_REWARD: AppointmentStatus[] = [
  AppointmentStatus.PICKED_UP,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

const ERRORS: Record<string, string> = {
  redeem_failed: "That reward could not be applied to this bill.",
  bad_photo_kind: "Say whether that photo is a before, an after, or something you noticed.",
  no_photo: "Choose a photo to upload.",
  photo_too_large: "That image is over 2 MB. Photograph it again at a smaller size.",
  photo_bad_type: "Photos have to be JPEG, PNG or WebP.",
  no_next_status: "This visit is already at the end of the groom flow.",
  already_there: "That is already the current status.",
  bad_date: "That date and time could not be read.",
  bad_duration: "Duration has to be a whole number of minutes.",
  no_services: "Pick at least one service.",
  not_in_shop: "The pet has to be checked in before it can go in a kennel.",
  kennel_missing: "That kennel no longer exists.",
  kennel_occupied: "That kennel already holds another pet.",
  kennel_out_of_service: "That kennel is out of service.",
  bad_event: "Pick a valid event type.",
  no_consent_note: "Say what the owner is being asked to approve.",
  bad_consent_answer: "Record the owner's answer as approved or declined.",
  not_floor_staff:
    "That account does not work the storefront — admin-only accounts cannot be assigned to a pet.",
  station_full: "That station is already at its maximum number of pets.",
  role_not_allowed:
    "That station is limited to specific roles, and the selected staff member does not hold one.",
  bad_amount: "An amount has to be above zero.",
  bad_surcharge: "Say what the fee is for.",
  bad_method: "Pick how the money was taken.",
  bad_tip: "The tip cannot be more than the payment it came in.",
};

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white";

/** datetime-local wants "YYYY-MM-DDTHH:mm". */
// This renders on the server, so getFullYear()/getHours() would print UTC in
// production — the heading beside it already reads shop time.
const toLocalInput = shopDateTimeLocalValue;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AppointmentDetailPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      pet: true,
      customer: { include: { alternateContacts: { orderBy: { createdAt: "asc" } } } },
      pricingTier: true,
      station: true,
      staff: { select: { id: true, name: true } },
      kennel: { include: { station: { select: { id: true, name: true } } } },
      services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      statusHistory: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      visitEvents: {
        include: { loggedBy: { select: { name: true } } },
        orderBy: { occurredAt: "desc" },
      },
      photos: {
        include: { takenBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      appointmentSurcharges: {
        include: { addedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      payments: {
        include: { takenBy: { select: { id: true, name: true } } },
        orderBy: { takenAt: "asc" },
      },
    },
  });
  if (!appointment) notFound();

  const [stations, groomers, serviceOptions, allKennels, surchargeOptions] = await Promise.all([
    prisma.station.findMany({
      where: { isActive: true, role: { in: WORK_STATION_ROLES } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    // Only people who work pets can be assigned to a visit.
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
      select: { id: true, name: true, roles: true },
      orderBy: { name: "asc" },
    }),
    getServiceOptions(),
    prisma.kennel.findMany({
      where: { isActive: true, station: { isActive: true } },
      include: {
        // Each unit carries its own compartment size.
        station: { select: { name: true, ...LIMIT_SELECT } },
        appointments: {
          where: { status: { in: KENNELABLE_STATUSES } },
          select: { id: true, customerId: true },
        },
      },
      orderBy: [{ station: { name: "asc" } }, { row: "asc" }, { column: "asc" }],
    }),
    // The published fee list, so the counter charges what the shop advertises.
    prisma.surcharge.findMany({
      where: { isActive: true },
      select: { id: true, label: true, minCents: true, maxCents: true, note: true },
      orderBy: { label: "asc" },
    }),
  ]);

  /*
   * A door is offered when it still has room for THIS pet, or when the pet is
   * already in it. Room is per household: a compartment holding this owner's
   * other dogs takes one more of theirs past the general rule.
   */
  const kennelRoom = new Map(
    allKennels.map((kennel) => {
      const limits = stationLimits(kennel.station);
      return [
        kennel.id,
        compartmentRoom(
          kennel.appointments.map((occupant) => occupant.customerId),
          appointment.customerId,
          limits.perCompartment,
          limits.householdMax
        ),
      ] as const;
    })
  );
  const openKennels = allKennels.filter(
    (kennel) => kennel.id === appointment.kennelId || kennelRoom.get(kennel.id)?.ok
  );

  const insights = [
    ...(await petInsights(appointment.petId)),
    ...(await customerInsights(appointment.customerId)),
  ];

  // What this pet was last groomed with, so the blade is a decision made once
  // rather than re-guessed every visit.
  const previousGroom = await lastGroomRecordForPet(appointment.petId, appointment.id);
  const consent = consentState(appointment);
  const config = await getConfig();

  const next = nextStatus(appointment.status);
  const arrival =
    appointment.status === AppointmentStatus.SCHEDULED
      ? arrivalLevel(appointment.scheduledAt, await arrivalThresholds())
      : null;
  const notice = Object.keys(NOTICES).find((key) => searchParams[key] === "1");
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  // Stated on the visit, not enforced here: the pet is already in the shop.
  const vaccinationChecks = await checksForPet(appointment.petId, config);

  const card = await rewardCard(appointment.customerId);

  // The ticket is the counter's arithmetic, not this page's.
  const ticket = ticketFromRow(appointment);
  const counterPayments = isEnabled(config, "featureCounterPayments");

  const bookedServiceIds = appointment.services
    .map((line) => line.serviceId)
    .filter((id): id is string => id != null);
  /*
   * What this pet usually gets and is not getting today. Asked at the counter
   * and nowhere else: a suggestion on the booking form shapes what the shop
   * sells before anybody has seen the dog. Here it is as often a line somebody
   * forgot to add as it is a sale.
   */
  const addOns = counterPayments ? await addOnPromptsFor(appointment.id) : [];

  const priced = appointment.services.filter((line) => line.priceCents != null);
  const total = priced.reduce((sum, line) => sum + (line.priceCents ?? 0), 0);
  // What this visit was quoted under. The discount was snapshotted at booking,
  // so editing the rate afterwards never changes what the customer was told.
  const rateDiscountCents = appointment.pricingDiscountCents ?? 0;
  // Both discounts are snapshots taken when they were applied, so neither
  // moves if the tier is edited or the reward's value is changed later.
  const rewardDiscountCents = appointment.rewardDiscountCents;
  const quotedCents = Math.max(0, total - rateDiscountCents - rewardDiscountCents);
  const inShop = appointment.checkedInAt != null;
  const elapsedMins = inShop
    ? Math.round((new Date().getTime() - appointment.checkedInAt!.getTime()) / 60000)
    : null;

  return (
    <PageShell
      back={{ href: "/staff/appointments", label: "Back to Appointments" }}
      title={appointment.pet.name}
      subtitle={`${appointment.customer.firstName} ${appointment.customer.lastName} · ${formatStatus(appointment.status)}`}
      className="max-w-5xl w-full"
    >

      {appointment.pet.hasBiteHistory && (
        <div className="border-t border-stone-100 bg-red-600 text-white px-3 py-2.5 font-bold text-sm flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">⚠</span> BITE HISTORY — handle with extreme caution
        </div>
      )}

      {notice && (
        <div className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          {NOTICES[notice]}
        </div>
      )}
      {searchParams.kennel && (
        <div className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          {searchParams.kennel === "cleared" ? "Kennel emptied." : "Pet moved into the kennel."}
        </div>
      )}
      {errorMessage && (
        <div className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {vaccinationChecks.some((check) => check.level !== "current") && (
        <div className="border-t border-stone-100 px-3 py-2">
          <VaccinationWarning checks={vaccinationChecks} petName={appointment.pet.name} />
        </div>
      )}

      {/* What the counter has to know before it quotes or hands the pet back. */}
      {appointment.customer.pricingNotes && (
        <div className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
          <span className="font-bold tracking-tight text-xs block">Pricing note</span>
          <span className="whitespace-pre-wrap">{appointment.customer.pricingNotes}</span>
        </div>
      )}
      {card.available > 0 && (
        <div className="border-t border-stone-100 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm font-medium flex items-center justify-between gap-3 flex-wrap">
          <span>
            ★ Reward ready — {card.label}
            <span className="block text-xs font-normal">
              {card.available > 1 && `${card.available} available. `}Worth{" "}
              {formatCents(card.valueCents)} off this bill.
            </span>
          </span>
          <span className="flex items-center gap-3">
            {!SETTLED_FOR_REWARD.includes(appointment.status) && quotedCents > 0 && (
              <form action={redeemCustomerReward}>
                <input type="hidden" name="customerId" value={appointment.customerId} />
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                >
                  Apply to this bill
                </button>
              </form>
            )}
            <Link
              href={`/staff/customers/${appointment.customerId}`}
              className="underline font-semibold whitespace-nowrap"
            >
              Open profile
            </Link>
          </span>
        </div>
      )}

      {/* Header */}
      <PageSection>
        {arrival === "missed" && (
          <div
            className={`mb-4 rounded-xl px-4 py-3 ${ARRIVAL_CLASS[arrival]}`}
            role="alert"
          >
            <p className="font-black">{ARRIVAL_LABEL[arrival]}</p>
            <p className="text-sm mt-0.5">
              This appointment is {minutesLate(appointment.scheduledAt)} minutes past its scheduled time
              and has not been checked in.
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <PhotoStack
              petPhotoUrl={photoUrl(appointment.pet.photoId) ?? appointment.pet.photoUrl}
              petName={appointment.pet.name}
              ownerPhotoUrl={photoUrl(appointment.customer.photoId)}
              ownerName={`${appointment.customer.firstName} ${appointment.customer.lastName}`}
            />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-black text-stone-900">
                  <Link href={`/staff/pets/${appointment.pet.id}`} className="hover:text-amber-700">
                    {appointment.pet.name}
                  </Link>
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    statusBadgeClass(appointment.status)
                  }`}
                >
                  {formatStatus(appointment.status)}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                  {appointment.appointmentType === "WALK_IN" ? "Walk-in" : "Appointment"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-[10px] font-bold tracking-tight text-stone-400">Pet</p>
                  <p className="text-stone-700">
                    {formatSpecies(appointment.pet.species)}
                    {appointment.pet.breed ? ` · ${appointment.pet.breed}` : ""}
                    {appointment.pet.weightLbs ? ` · ${appointment.pet.weightLbs} lbs` : ""}
                  </p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] font-bold tracking-tight text-stone-400">Owner</p>
                    <p className="text-stone-700">
                      <Link
                        href={`/staff/customers/${appointment.customer.id}`}
                        className="hover:text-amber-700 underline underline-offset-2"
                      >
                        {appointment.customer.firstName} {appointment.customer.lastName}
                      </Link>
                      {appointment.customer.phone && (
                        <a href={`tel:${appointment.customer.phone}`} className="block text-stone-500 hover:text-amber-700">
                          {appointment.customer.phone}
                        </a>
                      )}
                    </p>
                  </div>
                  {appointment.customer.alternateContacts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold tracking-tight text-stone-400">
                        Approved alternates
                      </p>
                      {appointment.customer.alternateContacts.map((alternate) => (
                        <p key={alternate.id} className="text-stone-700">
                          {alternate.name}
                          {alternate.phone && (
                            <a
                              href={`tel:${alternate.phone}`}
                              className="block text-stone-500 hover:text-amber-700"
                            >
                              {alternate.phone}
                            </a>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-tight text-stone-400">Schedule</p>
                  <p className="text-stone-700">
                    {formatShopDate(appointment.scheduledAt, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {formatShopTime(appointment.scheduledAt)}
                    {appointment.durationMins ? ` · ${appointment.durationMins} min booked` : ""}
                    {elapsedMins != null && ` · in the shop ${elapsedMins} min`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col items-end gap-2">
            {next && (
              <form action={moveStatus}>
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <input type="hidden" name="status" value={next} />
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  → {formatStatus(next)}
                </button>
              </form>
            )}
            <form action={moveStatus} className="flex items-center gap-2">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <select name="status" aria-label="Change status" defaultValue="" className={`${inputClass} w-44 py-1.5`}>
                <option value="" disabled>
                  Set status…
                </option>
                {Object.values(AppointmentStatus).map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline"
              >
                Apply
              </button>
            </form>
          </div>
        </div>

        {appointment.pet.groomingNotes && (
          <p className="text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg p-3 mt-3 whitespace-pre-wrap">
            <span className="font-semibold">Standing notes: </span>
            {appointment.pet.groomingNotes}
          </p>
        )}
        {appointment.pet.healthFlags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {appointment.pet.healthFlags.map((flag) => (
              <span
                key={flag}
                className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-full"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
      </PageSection>

      {insights.length > 0 && (
        <PageSection title="Worth knowing about this pet">
          <InsightList insights={insights} compact />
        </PageSection>
      )}

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Assignment */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            Assignment &amp; schedule
          </h2>
          <form action={updateAssignment} className="space-y-3">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <label className="block text-sm">
              <span className="block text-stone-500 mb-1">Groomer</span>
              <select name="staffId" defaultValue={appointment.staffId ?? ""} className={inputClass}>
                <option value="">Unassigned</option>
                {groomers.map((groomer) => (
                  <option key={groomer.id} value={groomer.id}>
                    {groomer.name} ({groomer.roles.map(formatRole).join(", ")})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-stone-500 mb-1">Station</span>
              <select
                name="stationId"
                defaultValue={appointment.stationId ?? ""}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                    {station.allowedRoles.length > 0 &&
                      ` — ${station.allowedRoles.map(formatRole).join("/")} only`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block text-stone-500 mb-1">Scheduled</span>
                <input
                  type="datetime-local"
                  name="scheduledAt"
                  defaultValue={toLocalInput(appointment.scheduledAt)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="block text-stone-500 mb-1">Minutes</span>
                <input
                  name="durationMins"
                  inputMode="numeric"
                  defaultValue={appointment.durationMins ?? ""}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="block text-stone-500 mb-1">Visit notes</span>
              <textarea
                name="visitNotes"
                rows={2}
                defaultValue={appointment.visitNotes ?? ""}
                className={`${inputClass} resize-y`}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Save
              </button>
            </div>
          </form>

          {/* Kennel */}
          <div className="mt-3 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-500 tracking-tight mb-2">
              Kennel
            </h3>
            {openKennels.length === 0 && !appointment.kennel ? (
              <p className="text-sm text-stone-400">No kennels available.</p>
            ) : (
              <form action={moveToKennel} className="flex items-center gap-2">
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <select
                  name="kennelId"
                  aria-label="Kennel"
                  defaultValue={appointment.kennel?.id ?? ""}
                  className={`${inputClass} py-1.5`}
                >
                  <option value="">Not in a kennel</option>
                  {openKennels.map((kennel) => (
                    <option key={kennel.id} value={kennel.id}>
                      {kennel.station.name} · {kennel.label}
                      {(() => {
                        const room = kennelRoom.get(kennel.id);
                        if (!room || room.limit <= 1) return null;
                        return ` (${room.inside}/${room.limit}${room.sharedHousehold ? " · same household" : ""})`;
                      })()}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                >
                  Move
                </button>
              </form>
            )}
            {appointment.kennel && (
              <p className="text-xs text-stone-500 mt-2">
                Currently in{" "}
                <Link
                  href={`/staff/stations/${appointment.kennel.station.id}`}
                  className="underline hover:text-stone-800"
                >
                  {appointment.kennel.station.name} {appointment.kennel.label}
                </Link>
                {appointment.kenneledAt && ` since ${formatShopTime(appointment.kenneledAt)}`}
              </p>
            )}
          </div>
        </section>

        {/* Services */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            Services
          </h2>
          {appointment.services.length === 0 ? (
            <p className="text-sm text-stone-400 mb-3">
              No line items — booked as {formatServiceType(appointment.serviceType)}.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 mb-3 text-sm">
              {appointment.services.map((line) => (
                <li key={line.id} className="py-2 flex items-start justify-between gap-3">
                  <span className="text-stone-800">
                    {line.service?.name ?? formatServiceType(line.serviceType)}
                    {line.sortOrder === 0 && (
                      <span className="ml-2 text-[10px] font-bold text-stone-400 ">
                        Primary
                      </span>
                    )}
                    {line.service?.staffNotes && (
                      <span className="block text-xs text-amber-700 whitespace-pre-wrap">
                        {line.service.staffNotes}
                      </span>
                    )}
                  </span>
                  <span className="text-stone-500 whitespace-nowrap">
                    {line.priceCents != null ? `from ${formatCents(line.priceCents)}` : "—"}
                  </span>
                </li>
              ))}
              {priced.length > 0 && (
                <li className="py-2 flex items-center justify-between text-sm text-stone-600">
                  <span>List price</span>
                  <span>{formatCents(total)}</span>
                </li>
              )}
              {rateDiscountCents > 0 && (
                <li className="py-2 flex items-center justify-between text-sm text-amber-800">
                  <span>
                    {appointment.pricingTier?.name ?? "Agreed rate"}
                    <span className="block text-xs text-stone-500">
                      Quoted when this visit was booked.
                    </span>
                  </span>
                  <span>−{formatCents(rateDiscountCents)}</span>
                </li>
              )}
              {rewardDiscountCents > 0 && (
                <li className="py-2 flex items-center justify-between text-sm text-emerald-800">
                  <span>
                    Reward applied
                    <span className="block text-xs text-stone-500">
                      Taken off this bill when the reward was redeemed.
                    </span>
                  </span>
                  <span>−{formatCents(rewardDiscountCents)}</span>
                </li>
              )}
              {priced.length > 0 && (
                <li className="py-2 flex items-center justify-between text-sm font-semibold text-stone-900">
                  <span>Estimated from</span>
                  <span>{formatCents(quotedCents)}</span>
                </li>
              )}
            </ul>
          )}

          <details>
            <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
              Change services
            </summary>
            <form action={updateServices} className="mt-3 space-y-3">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <ServicePicker
                services={serviceOptions}
                initialServiceIds={bookedServiceIds}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  Save services
                </button>
              </div>
            </form>
          </details>
        </section>
      </PageSection>

      {counterPayments && (
        <PageSection>
          {addOns.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Usually on this pet&apos;s ticket</p>
              <ul className="mt-1 space-y-1">
                {addOns.map((addOn) => (
                  <li key={addOn.serviceId} className="flex flex-wrap items-center justify-between gap-2">
                    {/* The count is the evidence: never a claim the counter cannot check. */}
                    <span>
                      {addOn.name} — on {addOn.seen} of the last {addOn.of} visits
                    </span>
                    {/* Reuses the services form's own action, so adding a line
                        here and editing the list below are one code path. */}
                    <form action={updateServices}>
                      <input type="hidden" name="appointmentId" value={appointment.id} />
                      {bookedServiceIds.map((id) => (
                        <input key={id} type="hidden" name="serviceIds" value={id} />
                      ))}
                      <input type="hidden" name="serviceIds" value={addOn.serviceId} />
                      <button
                        type="submit"
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Add to ticket
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <TicketPanel
            appointmentId={appointment.id}
            ticket={ticket}
            surcharges={appointment.appointmentSurcharges}
            payments={appointment.payments}
            surchargeOptions={surchargeOptions}
            tierName={appointment.pricingTier?.name ?? null}
            returnTo={`/staff/appointments/${appointment.id}`}
          />
        </PageSection>
      )}

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* What the pet was groomed with, for whoever has it next */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">Groom record</h2>
          {previousGroom ? (
            <p className="text-sm text-stone-600 mb-3 rounded-lg bg-white border border-stone-200 px-3 py-2">
              <span className="block text-xs text-stone-400">
                Last time ({formatShopDate(previousGroom.completedAt ?? previousGroom.scheduledAt)})
              </span>
              {groomRecordSummary(previousGroom)}
            </p>
          ) : (
            <p className="text-sm text-stone-400 mb-3">
              Nothing written down from a previous visit.
            </p>
          )}

          <form action={saveGroomRecord} className="space-y-2">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="block text-stone-500 mb-1 text-xs">Blade / comb</span>
                <input
                  name="groomBlade"
                  list="blade-terms"
                  defaultValue={appointment.groomBlade ?? ""}
                  placeholder="#7F"
                  className={`${inputClass} py-1.5`}
                />
              </label>
              <label className="text-sm">
                <span className="block text-stone-500 mb-1 text-xs">Shampoo</span>
                <input
                  name="groomShampoo"
                  defaultValue={appointment.groomShampoo ?? ""}
                  placeholder="Oatmeal"
                  className={`${inputClass} py-1.5`}
                />
              </label>
            </div>
            {/* The blade chart the shop already reads at /staff/resources, as
                suggestions rather than a closed list — every shop keeps a tool
                that is not on it. */}
            <datalist id="blade-terms">
              {BLADE_TERMS.map((term) => (
                <option key={term} value={term} />
              ))}
            </datalist>
            <label className="text-sm block">
              <span className="block text-stone-500 mb-1 text-xs">
                What the next groomer should know
              </span>
              <textarea
                name="groomRecordNotes"
                rows={2}
                defaultValue={appointment.groomRecordNotes ?? ""}
                placeholder="Left the head long, feet scissored, owner wants shorter next time"
                className={`${inputClass} py-1.5 resize-y`}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-400">
                This visit only. Standing instructions live on {appointment.pet.name}&apos;s profile.
              </p>
              <button
                type="submit"
                className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                Save record
              </button>
            </div>
          </form>
        </section>

        {/* Owner's say-so when the groom cannot be done as booked */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">Owner consent</h2>

          {consent === "none" ? (
            <p className="text-sm text-stone-400 mb-3">
              Nothing has been put to the owner on this visit.
            </p>
          ) : (
            <div
              className={`text-sm rounded-lg border px-3 py-2 mb-3 ${
                consent === "granted"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : consent === "declined"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <p className="font-semibold">
                {consent === "granted"
                  ? "Owner approved"
                  : consent === "declined"
                    ? "Owner declined"
                    : "Waiting on the owner"}
              </p>
              {appointment.consentNote && (
                <p className="mt-1 whitespace-pre-wrap">{appointment.consentNote}</p>
              )}
              <p className="text-xs mt-1 opacity-80">
                Asked{" "}
                {appointment.consentRequestedAt
                  ? formatShopTime(appointment.consentRequestedAt)
                  : "in person"}
                {consent !== "pending" &&
                  ` · answered ${formatShopTime(
                    (consent === "granted"
                      ? appointment.consentGrantedAt
                      : appointment.consentDeclinedAt)!
                  )}`}
              </p>
            </div>
          )}

          {consent === "pending" && (
            <form action={recordConsent} className="flex gap-2 mb-3">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <button
                type="submit"
                name="answer"
                value="granted"
                className="flex-1 bg-green-700 hover:bg-green-800 text-white px-3 py-2 rounded-lg text-xs font-semibold"
              >
                They approved it
              </button>
              <button
                type="submit"
                name="answer"
                value="declined"
                className="flex-1 bg-stone-700 hover:bg-stone-800 text-white px-3 py-2 rounded-lg text-xs font-semibold"
              >
                They said no
              </button>
            </form>
          )}

          <details className="disclosure" open={consent === "none"}>
            <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
              {consent === "none" ? "Ask the owner" : "Ask about something else"}
            </summary>
            <form action={requestConsent} className="mt-3 space-y-2">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <textarea
                name="consentNote"
                rows={3}
                required
                aria-label="What the owner is being asked to approve"
                placeholder="Matting is too tight to brush out safely. We would need to take the coat to a #7F, plus the matting fee."
                className={`${inputClass} py-1.5 resize-y`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-400">
                  Emails and texts the owner, then wait for them to call back. Asking again clears
                  any earlier answer.
                </p>
                <button
                  type="submit"
                  className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                >
                  Send request
                </button>
              </div>
            </form>
          </details>
        </section>
      </PageSection>

      {/* Photos of the day. Hidden with the feature, but the photos already
          taken are still here when it comes back -- the strip renders whatever
          is on the visit and the uploader is what goes away. */}
      {(config.featureVisitPhotos || appointment.photos.length > 0) && (
        <PageSection title={`Photos (${appointment.photos.length})`}>
          <VisitPhotoStrip photos={appointment.photos} petName={appointment.pet.name} showVisibility>
            {(photo) =>
              config.featureVisitPhotos ? (
                <div className="flex items-center gap-2 mt-1">
                  <form action={setVisitPhotoVisibility}>
                    <input type="hidden" name="appointmentId" value={appointment.id} />
                    <input type="hidden" name="photoRowId" value={photo.id} />
                    {/* Absent means off, the same convention every checkbox in
                        this app posts under. */}
                    {!photo.ownerVisible && <input type="hidden" name="ownerVisible" value="on" />}
                    <button type="submit" className="text-xs text-amber-700 hover:text-amber-900 underline">
                      {photo.ownerVisible ? "Hide from owner" : "Show owner"}
                    </button>
                  </form>
                  <form action={deleteVisitPhoto}>
                    <input type="hidden" name="appointmentId" value={appointment.id} />
                    <input type="hidden" name="photoRowId" value={photo.id} />
                    <button type="submit" className="text-xs text-stone-400 hover:text-red-700 underline">
                      Remove
                    </button>
                  </form>
                </div>
              ) : null
            }
          </VisitPhotoStrip>

          {config.featureVisitPhotos && (
            <form
              action={addVisitPhoto}
              encType="multipart/form-data"
              className="mt-3 border-t border-stone-100 pt-3 space-y-2 max-w-md"
            >
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <div className="flex gap-2">
                <select name="kind" aria-label="What the photo is of" defaultValue="" required className={`${inputClass} py-1.5`}>
                  <option value="" disabled>
                    What is it…
                  </option>
                  <option value={VisitPhotoKind.BEFORE}>Before — the coat as it arrived</option>
                  <option value={VisitPhotoKind.AFTER}>After — the finished groom</option>
                  <option value={VisitPhotoKind.ISSUE}>Something you noticed</option>
                </select>
                <button
                  type="submit"
                  className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                >
                  Add
                </button>
              </div>
              <input
                type="file"
                name="photo"
                required
                accept="image/jpeg,image/png,image/webp"
                aria-label="Photo file"
                className="w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold hover:file:bg-stone-200"
              />
              <input name="caption" aria-label="Caption" placeholder="Caption (optional)" className={`${inputClass} py-1.5`} />
              <label className="flex items-start gap-2 text-sm text-stone-600">
                <input type="checkbox" name="ownerVisible" className="mt-0.5 h-4 w-4 accent-amber-600" />
                <span>
                  Show the owner
                  <span className="block text-xs text-stone-400">
                    Off by default. A matted belly is usually the shop&apos;s own record; the
                    finished groom is what an owner wants.
                  </span>
                </span>
              </label>
              <p className="text-xs text-stone-400">JPEG, PNG or WebP, up to 2 MB.</p>
            </form>
          )}
        </PageSection>
      )}

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Visit events */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            What happened ({appointment.visitEvents.length})
          </h2>
          {appointment.visitEvents.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing logged for this visit.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm mb-3">
              {appointment.visitEvents.map((event) => (
                <li key={event.id} className="py-2">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      event.eventType === VisitEventType.BITE
                        ? "bg-red-100 text-red-700"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {formatVisitEvent(event.eventType)}
                  </span>
                  {event.ownerVisible && (
                    <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Told the owner
                    </span>
                  )}
                  {event.note && <span className="ml-2 text-stone-700">{event.note}</span>}
                  <span className="block text-xs text-stone-400 mt-0.5">
                    {formatShopTime(event.occurredAt)} on {formatShopDate(event.occurredAt)}
                    {event.loggedBy && ` · ${event.loggedBy.name}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={logVisitEvent} className="space-y-2 border-t border-stone-100 pt-3">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <div className="flex gap-2">
              <select name="eventType" aria-label="Incident type" defaultValue="" required className={`${inputClass} py-1.5`}>
                <option value="" disabled>
                  Log an event…
                </option>
                {Object.values(VisitEventType).map((type) => (
                  <option key={type} value={type}>
                    {formatVisitEvent(type)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                Log
              </button>
            </div>
            <input name="note" aria-label="Incident details" placeholder="Details (optional)" className={`${inputClass} py-1.5`} />
            <label className="flex items-start gap-2 text-sm text-stone-600">
              <input type="checkbox" name="ownerVisible" className="mt-0.5 h-4 w-4 accent-amber-600" />
              <span>
                Tell the owner
                <span className="block text-xs text-stone-400">
                  Goes out with the ready-for-pickup message. Tick it for anything you noticed on
                  the pet — ears, skin, lumps, fleas.
                </span>
              </span>
            </label>
            <p className="text-xs text-stone-400">
              Logging a bite permanently flags {appointment.pet.name} on every screen, including the
              station display.
            </p>
          </form>
        </section>

        {/* Audit trail */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            Status history
          </h2>
          {appointment.statusHistory.length === 0 ? (
            <p className="text-sm text-stone-400">No status changes recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {appointment.statusHistory.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        statusBadgeClass(entry.status)
                      }`}
                    >
                      {formatStatus(entry.status)}
                    </span>
                    {entry.note && <span className="ml-2 text-stone-600">{entry.note}</span>}
                  </span>
                  <span className="text-xs text-stone-400 whitespace-nowrap">
                    {formatShopTime(entry.changedAt)}
                    {entry.changedBy && ` · ${entry.changedBy.name}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageSection>
    </PageShell>
  );
}
