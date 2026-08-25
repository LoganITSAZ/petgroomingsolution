import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppointmentStatus, StaffRole, StationRole, VisitEventType } from "@prisma/client";
import { nextStatus } from "@/lib/appointment-status";
import { getServiceOptions } from "@/lib/appointment-services";
import { KENNELABLE_STATUSES, compartmentCapacity } from "@/lib/kennels";
import { formatCents } from "@/lib/pricing";
import { rewardCard } from "@/lib/rewards";
import {
  formatServiceType,
  formatShopDate,
  formatRole,
  formatShopTime,
  formatSpecies,
  formatStatus,
} from "@/lib/utils";
import {
  ARRIVAL_CLASS,
  ARRIVAL_LABEL,
  arrivalLevel,
  arrivalThresholds,
  minutesLate,
} from "@/lib/arrivals";
import ServicePicker from "@/components/ServicePicker";
import PhotoStack from "@/components/PhotoStack";
import InsightList from "@/components/InsightList";
import { customerInsights, petInsights } from "@/lib/insights";
import { photoUrl } from "@/lib/photos";
import {
  logVisitEvent,
  moveStatus,
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

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-stone-100 text-stone-600",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DRYING: "bg-sky-100 text-sky-700",
  FINISHING: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-green-100 text-green-700",
  READY_PICKUP: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-stone-100 text-stone-400",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-400",
};

const eventLabel: Record<VisitEventType, string> = {
  REWASH: "Re-wash",
  BITE: "Bite",
  BEHAVIORAL: "Behavioural",
  INJURY: "Injury",
  MATTING_FOUND: "Matting found",
  EQUIPMENT_ISSUE: "Equipment issue",
  OTHER: "Other",
};

const NOTICES: Record<string, string> = {
  moved: "Status updated.",
  saved: "Appointment saved.",
  services: "Services updated.",
  event: "Visit event logged.",
};

const ERRORS: Record<string, string> = {
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
  not_floor_staff:
    "That account does not work the floor — admin-only accounts cannot be assigned to a pet.",
  station_full: "That station is already at its maximum number of pets.",
  role_not_allowed:
    "That station is limited to specific roles, and the selected staff member does not hold one.",
};

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white";

/** datetime-local wants "YYYY-MM-DDTHH:mm". */
function toLocalInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours()
  )}:${pad(value.getMinutes())}`;
}

interface PageProps {
  params: { id: string };
  searchParams: Record<string, string | undefined>;
}

export default async function AppointmentDetailPage({ params, searchParams }: PageProps) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      pet: true,
      customer: true,
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
    },
  });
  if (!appointment) notFound();

  const [stations, groomers, serviceOptions, allKennels, perCompartment] = await Promise.all([
    prisma.station.findMany({
      where: { isActive: true, role: { not: StationRole.KENNEL } },
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
        station: { select: { name: true } },
        _count: { select: { appointments: { where: { status: { in: KENNELABLE_STATUSES } } } } },
      },
      orderBy: [{ station: { name: "asc" } }, { row: "asc" }, { column: "asc" }],
    }),
    compartmentCapacity(),
  ]);

  // A door is offered when it still has room, or when this pet is already in it.
  const openKennels = allKennels.filter(
    (kennel) =>
      kennel.id === appointment.kennelId || kennel._count.appointments < perCompartment
  );

  const insights = [
    ...(await petInsights(appointment.petId)),
    ...(await customerInsights(appointment.customerId)),
  ];

  const next = nextStatus(appointment.status);
  const arrival =
    appointment.status === AppointmentStatus.SCHEDULED
      ? arrivalLevel(appointment.scheduledAt, await arrivalThresholds())
      : null;
  const notice = Object.keys(NOTICES).find((key) => searchParams[key] === "1");
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  const card = await rewardCard(appointment.customerId);

  const priced = appointment.services.filter((line) => line.priceCents != null);
  const total = priced.reduce((sum, line) => sum + (line.priceCents ?? 0), 0);
  // What this visit was quoted under. The discount was snapshotted at booking,
  // so editing the rate afterwards never changes what the customer was told.
  const rateDiscountCents = appointment.pricingDiscountCents ?? 0;
  const quotedCents = Math.max(0, total - rateDiscountCents);
  const inShop = appointment.checkedInAt != null;
  const elapsedMins = inShop
    ? Math.round((Date.now() - appointment.checkedInAt!.getTime()) / 60000)
    : null;

  return (
    <div className="space-y-5 max-w-5xl">
      <Link
        href="/staff/appointments"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        ← Back to Appointments
      </Link>

      {appointment.pet.hasBiteHistory && (
        <div className="bg-red-600 text-white rounded-xl px-5 py-3 font-bold text-sm flex items-center gap-3">
          <span className="text-xl">⚠</span> BITE HISTORY — handle with extreme caution
        </div>
      )}

      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-green-800 text-sm font-medium">
          {NOTICES[notice]}
        </div>
      )}
      {searchParams.kennel && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-green-800 text-sm font-medium">
          {searchParams.kennel === "cleared" ? "Kennel emptied." : "Pet moved into the kennel."}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* What the counter has to know before it quotes or hands the pet back. */}
      {appointment.customer.pricingNotes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-800 text-sm">
          <span className="font-bold uppercase tracking-wide text-xs block">Pricing note</span>
          <span className="whitespace-pre-wrap">{appointment.customer.pricingNotes}</span>
        </div>
      )}
      {card.available > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-emerald-800 text-sm font-medium flex items-center justify-between gap-3 flex-wrap">
          <span>
            ★ Reward ready — {card.label}
            <span className="block text-xs font-normal">
              {card.available > 1 && `${card.available} available. `}Redeem it on the customer&apos;s
              profile when they take it.
            </span>
          </span>
          <Link
            href={`/staff/customers/${appointment.customerId}`}
            className="underline font-semibold whitespace-nowrap"
          >
            Open profile
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
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
                    statusColor[appointment.status] ?? "bg-stone-100 text-stone-500"
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Pet</p>
                  <p className="text-stone-700">
                    {formatSpecies(appointment.pet.species)}
                    {appointment.pet.breed ? ` · ${appointment.pet.breed}` : ""}
                    {appointment.pet.weightLbs ? ` · ${appointment.pet.weightLbs} lbs` : ""}
                  </p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Owner</p>
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
                  {appointment.customer.altContactName && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Approved alternate</p>
                      <p className="text-stone-700">
                        {appointment.customer.altContactName}
                        {appointment.customer.altContactPhone && (
                          <a
                            href={`tel:${appointment.customer.altContactPhone}`}
                            className="block text-stone-500 hover:text-amber-700"
                          >
                            {appointment.customer.altContactPhone}
                          </a>
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Schedule</p>
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
                  className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
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
      </div>

      {insights.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-1.5">
            Worth knowing about this pet
          </h2>
          <InsightList insights={insights} compact />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Assignment */}
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
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
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">
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
                      {perCompartment > 1 &&
                        ` (${kennel._count.appointments}/${perCompartment})`}
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
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
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
                      <span className="ml-2 text-[10px] font-bold text-stone-400 uppercase">
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
                initialServiceIds={appointment.services
                  .map((line) => line.serviceId)
                  .filter((id): id is string => id != null)}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Visit events */}
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
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
                    {eventLabel[event.eventType]}
                  </span>
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
                    {eventLabel[type]}
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
            <p className="text-xs text-stone-400">
              Logging a bite permanently flags {appointment.pet.name} on every screen, including the
              station display.
            </p>
          </form>
        </section>

        {/* Audit trail */}
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
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
                        statusColor[entry.status] ?? "bg-stone-100 text-stone-500"
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
      </div>
    </div>
  );
}
