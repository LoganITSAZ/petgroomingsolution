import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { StationRole } from "@prisma/client";
import {
  KENNELABLE_STATUSES,
  compartmentRoom,
  getKennelBoard,
  householdCompartmentLimit,
  kennelDemand,
} from "@/lib/kennels";
import { OCCUPYING_STATUSES, stationCapacity } from "@/lib/stations";
import PhotoStack from "@/components/PhotoStack";
import { photoUrl } from "@/lib/photos";
import { guidesForBreeds, tipLines } from "@/lib/breeds";
import {
  formatCoatType,
  formatRole,
  formatSpecies,
  formatServiceType,
  formatShopDate,
  formatShopTime,
  formatStationRole,
  formatStatus,
  shopDayRange,
  statusBadgeClass,
} from "@/lib/utils";
import { assignKennel, releaseKennel, setKennelService } from "../actions";
import { currentStaffIsAdmin } from "@/lib/staff-roles";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Station" };



const NOTICES: Record<string, string> = {
  assigned: "Pet moved into the kennel.",
  released: "Kennel emptied.",
  out_of_service: "Kennel marked out of service.",
  back_in_service: "Kennel back in service.",
};

const ERRORS: Record<string, string> = {
  no_pet_selected: "Pick a pet before assigning a kennel.",
  kennel_occupied:
    "That kennel is full. A compartment only takes more than the shop's rule when every pet inside is from the same household.",
  kennel_out_of_service: "That kennel is out of service.",
  appointment_not_found: "That visit no longer exists.",
  not_in_shop: "That pet is not checked in, so it cannot be kennelled.",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function StaffStationDetailPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const station = await prisma.station.findUnique({ where: { id: params.id } });
  if (!station) notFound();

  const isAdmin = await currentStaffIsAdmin();

  const isKennel = station.role === StationRole.KENNEL;
  const { start, end } = shopDayRange();

  const [kennels, assignable, occupants, todayHere, householdMax] = await Promise.all([
    isKennel ? getKennelBoard(station.id) : Promise.resolve([]),
    isKennel
      ? prisma.appointment.findMany({
          where: { status: { in: KENNELABLE_STATUSES }, kennelId: null },
          include: {
            pet: { select: { name: true } },
            customer: { select: { lastName: true } },
          },
          orderBy: { checkedInAt: "asc" },
        })
      : Promise.resolve([]),
    isKennel
      ? Promise.resolve([])
      : prisma.appointment.findMany({
          where: { stationId: station.id, status: { in: OCCUPYING_STATUSES } },
          include: {
            pet: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                alternateContacts: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
              },
            },
            staff: { select: { name: true } },
            services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
          },
          orderBy: { checkedInAt: "asc" },
        }),
    prisma.appointment.findMany({
      where: { stationId: station.id, scheduledAt: { gte: start, lt: end } },
      include: {
        pet: { select: { id: true, name: true } },
        customer: { select: { firstName: true, lastName: true } },
        staff: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    householdCompartmentLimit(),
  ]);

  // Breed reference for whoever is standing at this station.
  const guides = await guidesForBreeds(occupants.map((appt) => appt.pet.breed));
  // One instant for every row, rather than a fresh clock read per pet.
  const nowMs = new Date().getTime();

  const notice = Object.keys(NOTICES).find((key) => searchParams[key] === "1");
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const occupiedCount = kennels.reduce((n, kennel) => n + kennel.appointments.length, 0);
  const capacity = stationCapacity({ ...station, kennels });
  const demand = isKennel
    ? await kennelDemand(start, end)
    : { capacity: 0, occupied: 0, reserved: 0, free: 0, perCompartment: 1 };

  return (
    <PageShell
      back={{ href: "/staff/stations", label: "Back to Stations" }}
      title={station.name}
      className="max-w-5xl w-full"
      subtitle={
        <>
          {formatStationRole(station.role)}
          {!isKennel && ` · ${occupants.length}/${capacity} pets`}
          {station.allowedRoles.length > 0 &&
            ` · ${station.allowedRoles.map(formatRole).join(" or ")} only`}
          {!station.isActive && " · inactive"}
          {isKennel && ` · ${occupiedCount}/${kennels.length * demand.perCompartment} occupied`}
          {isKennel && demand.reserved > 0 && ` · ${demand.reserved} still expected today`}
        </>
      }
      actions={
        <>
          {isAdmin && (
            <Link
              href={`/admin/stations/${station.id}/edit`}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Edit Station
            </Link>
          )}
          <Link
            href={`/station/${station.id}`}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            Open Station Display
          </Link>
        </>
      }
    >

      {notice && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          {NOTICES[notice]}
        </p>
      )}
      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      {/* Kennel grid */}
      {isKennel ? (
        kennels.length === 0 ? (
          <PageSection className="text-center text-stone-400 text-sm">
            This unit has no kennels yet. An admin sets the layout on the station&apos;s edit page.
          </PageSection>
        ) : (
          <PageSection
            bodyClassName="grid gap-3"
            bodyStyle={{
              gridTemplateColumns: `repeat(${station.kennelColumns ?? 1}, minmax(11rem, 1fr))`,
            }}
          >
            {kennels.map((kennel) => {
              const inside = kennel.appointments;
              const occupantCustomerIds = inside.map((appt) => appt.customerId);
              /*
               * Who may go in here is a per-pet question: a door holding one
               * household's dogs still has room for another of theirs, and
               * none for anybody else's.
               */
              const canJoin = assignable.filter(
                (appt) =>
                  compartmentRoom(
                    occupantCustomerIds,
                    appt.customerId,
                    demand.perCompartment,
                    householdMax
                  ).ok
              );
              const household =
                inside.length > 0 &&
                occupantCustomerIds.every((id) => id === occupantCustomerIds[0]);
              const shown = household ? householdMax : demand.perCompartment;
              const full = inside.length >= shown;

              return (
                <div
                  key={kennel.id}
                  className={`rounded-xl border p-3 flex flex-col gap-2 ${
                    !kennel.isActive
                      ? "bg-stone-100 border-stone-200"
                      : inside.length > 0
                        ? "bg-white border-emerald-300"
                        : "bg-well border-well-line"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-stone-800">{kennel.label}</span>
                    {!kennel.isActive ? (
                      <span className="text-[10px] font-bold text-stone-400 ">
                        Out of service
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-stone-400 ">
                        {inside.length}/{shown}
                        {household && inside.length > demand.perCompartment && (
                          <span className="ml-1 text-emerald-700">same home</span>
                        )}
                      </span>
                    )}
                  </div>

                  {inside.map((appt) => (
                    <div key={appt.id} className="border-t border-stone-100 pt-1.5 first:border-0 first:pt-0">
                      <Link
                        href={`/staff/pets/${appt.pet.id}`}
                        className="font-bold text-stone-900 hover:text-amber-700"
                      >
                        {appt.pet.name}
                      </Link>
                      {appt.pet.hasBiteHistory && (
                        <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                          BITE
                        </span>
                      )}
                      <p className="text-xs text-stone-500">
                        {appt.customer.firstName} {appt.customer.lastName}
                      </p>
                      <p className="text-xs text-stone-400">
                        {formatStatus(appt.status)}
                        {appt.kenneledAt && ` · in since ${formatShopTime(appt.kenneledAt)}`}
                      </p>
                    </div>
                  ))}

                  {kennel.isActive && !full && (
                    <form action={assignKennel} className="mt-auto space-y-2">
                      <input type="hidden" name="kennelId" value={kennel.id} />
                      <select
                        name="appointmentId"
                        aria-label="Pet to place in this kennel"
                        defaultValue=""
                        className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="">Select a pet…</option>
                        {canJoin.map((appt) => (
                          <option key={appt.id} value={appt.id}>
                            {appt.pet.name} ({appt.customer.lastName})
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={canJoin.length === 0}
                        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors"
                      >
                        Put in kennel
                      </button>
                    </form>
                  )}

                  {inside.length > 0 && (
                    <form action={releaseKennel}>
                      <input type="hidden" name="kennelId" value={kennel.id} />
                      <button
                        type="submit"
                        className="w-full bg-stone-800 hover:bg-stone-900 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors"
                      >
                        Empty {inside.length > 1 ? "all" : "kennel"}
                      </button>
                    </form>
                  )}

                  <form action={setKennelService}>
                    <input type="hidden" name="kennelId" value={kennel.id} />
                    <button
                      type="submit"
                      className="w-full text-[11px] text-stone-400 hover:text-stone-700 underline"
                    >
                      {kennel.isActive ? "Mark out of service" : "Return to service"}
                    </button>
                  </form>
                </div>
              );
            })}
          </PageSection>
        )
      ) : (
        /* Work station — one card per pet it is holding */
        <PageSection>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-stone-500 tracking-tight">
              At this station now
            </h2>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                occupants.length >= capacity
                  ? "bg-red-100 text-red-700"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {occupants.length}/{capacity}
              {occupants.length >= capacity ? " full" : ""}
            </span>
          </div>

          {occupants.length === 0 ? (
            <p className="text-sm text-stone-400">Open — no pet at this station.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {occupants.map((appt) => {
                const guide = guides.get((appt.pet.breed ?? "").trim().toLowerCase()) ?? null;
                const mins = appt.checkedInAt
                  ? Math.round((nowMs - appt.checkedInAt.getTime()) / 60000)
                  : null;
                const serviceMins = appt.services.reduce(
                  (sum, line) => sum + (line.service?.durationMins ?? 0),
                  0
                );
                const booked = appt.durationMins ?? (serviceMins > 0 ? serviceMins : null);
                const over = booked != null && mins != null && mins > booked;

                return (
                  <li key={appt.id} className="py-3 first:pt-0 space-y-2">
                    {/* Who and what */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3">
                        <PhotoStack
                          petPhotoUrl={photoUrl(appt.pet.photoId) ?? appt.pet.photoUrl}
                          petName={appt.pet.name}
                          ownerPhotoUrl={null}
                          ownerName={`${appt.customer.firstName} ${appt.customer.lastName}`}
                          size={48}
                        />
                        <div>
                          <p className="text-lg font-black text-stone-900">
                            <Link
                              href={`/staff/appointments/${appt.id}`}
                              className="hover:text-amber-700"
                            >
                              {appt.pet.name}
                            </Link>
                            <span className="ml-2 text-sm font-medium text-stone-500">
                              {[
                                formatSpecies(appt.pet.species),
                                appt.pet.breed,
                                appt.pet.coatType ? `${formatCoatType(appt.pet.coatType)} coat` : null,
                                appt.pet.weightLbs ? `${appt.pet.weightLbs} lbs` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </p>
                          <p className="text-sm text-stone-600">
                            {appt.customer.firstName} {appt.customer.lastName}
                            {appt.customer.phone && (
                              <a
                                href={`tel:${appt.customer.phone}`}
                                className="ml-2 hover:text-amber-700"
                              >
                                {appt.customer.phone}
                              </a>
                            )}
                            {appt.customer.alternateContacts.length > 0 && (
                              <span className="text-stone-400">
                                {" "}
                                · also approved:{" "}
                                {appt.customer.alternateContacts.map((a) => a.name).join(", ")}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            statusBadgeClass(appt.status)
                          }`}
                        >
                          {formatStatus(appt.status)}
                        </span>
                        <p className={`text-xs mt-1 ${over ? "text-red-600 font-semibold" : "text-stone-400"}`}>
                          {mins == null ? "not checked in" : `${mins} min in`}
                          {booked != null && ` / ${booked} booked`}
                        </p>
                        <p className="text-xs text-stone-400">
                          {appt.staff?.name ?? "No groomer assigned"}
                        </p>
                      </div>
                    </div>

                    {appt.pet.hasBiteHistory && (
                      <p className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-sm font-bold">
                        ⚠ BITE HISTORY — handle with extreme caution
                      </p>
                    )}

                    {/* The work itself */}
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="border border-stone-200 rounded-lg p-2">
                        <p className="text-[10px] font-bold text-stone-500 tracking-tight mb-1">
                          Booked services
                        </p>
                        <ul className="text-sm space-y-1">
                          {appt.services.length === 0 ? (
                            <li className="text-stone-500">
                              {formatServiceType(appt.serviceType)}
                            </li>
                          ) : (
                            appt.services.map((line) => (
                              <li key={line.id}>
                                <span className="font-semibold text-stone-800">
                                  {line.service?.name ?? formatServiceType(line.serviceType)}
                                </span>
                                {line.service?.durationMins && (
                                  <span className="text-stone-400">
                                    {" "}
                                    · {line.service.durationMins} min
                                  </span>
                                )}
                                {line.service?.staffNotes && (
                                  <span className="block text-xs text-amber-700 whitespace-pre-wrap">
                                    {line.service.staffNotes}
                                  </span>
                                )}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>

                      <div className="border border-stone-200 rounded-lg p-2 space-y-1.5">
                        <p className="text-[10px] font-bold text-stone-500 tracking-tight">
                          This pet
                        </p>
                        {appt.pet.healthFlags.length > 0 && (
                          <p className="flex flex-wrap gap-1">
                            {appt.pet.healthFlags.map((flag) => (
                              <span
                                key={flag}
                                className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                              >
                                {flag}
                              </span>
                            ))}
                          </p>
                        )}
                        {appt.pet.groomingNotes && (
                          <p className="text-sm text-stone-700 whitespace-pre-wrap">
                            {appt.pet.groomingNotes}
                          </p>
                        )}
                        {appt.pet.temperamentNotes && (
                          <p className="text-sm text-stone-600 whitespace-pre-wrap">
                            <span className="font-semibold">Temperament: </span>
                            {appt.pet.temperamentNotes}
                          </p>
                        )}
                        {appt.pet.healthFlags.length === 0 &&
                          !appt.pet.groomingNotes &&
                          !appt.pet.temperamentNotes && (
                            <p className="text-sm text-stone-400">Nothing recorded.</p>
                          )}
                      </div>
                    </div>

                    {/* Breed reference — a job aid, never above the pet's own notes */}
                    {guide && (
                      <details className="border border-sky-200 bg-sky-50 rounded-lg">
                        <summary className="px-2 py-1.5 cursor-pointer text-sm">
                          <span className="font-semibold text-sky-900">
                            {guide.breed} reference
                          </span>
                          <span className="text-sky-800"> — {guide.summary}</span>
                        </summary>
                        <div className="px-2 pb-2">
                          <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5">
                            {tipLines(guide).map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                          {guide.typicalMins && (
                            <p className="text-xs text-sky-800 mt-1">
                              Usually takes about {guide.typicalMins} minutes here.
                            </p>
                          )}
                          <p className="text-[11px] text-stone-400 mt-1">
                            General guidance for the breed. {appt.pet.name}&apos;s own notes come
                            first.
                          </p>
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PageSection>
      )}

      {/* Today at this station */}
      <PageSection title={`Today at this station (${todayHere.length})`}>
        {todayHere.length === 0 ? (
          <p className="text-stone-400 text-sm">
            Nothing scheduled here for {formatShopDate(new Date())}.
          </p>
        ) : (
          <div className="border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-well text-stone-500 text-xs tracking-tight">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">Time</th>
                  <th scope="col" className="px-3 py-2 text-left">Pet</th>
                  <th scope="col" className="px-3 py-2 text-left">Owner</th>
                  <th scope="col" className="px-3 py-2 text-left">Groomer</th>
                  <th scope="col" className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {todayHere.map((appt) => (
                  <tr key={appt.id}>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {formatShopTime(appt.scheduledAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/staff/pets/${appt.pet.id}`}
                        className="font-semibold text-stone-900 hover:text-amber-700"
                      >
                        {appt.pet.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {appt.customer.firstName} {appt.customer.lastName}
                    </td>
                    <td className="px-3 py-2 text-stone-500">{appt.staff?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          statusBadgeClass(appt.status)
                        }`}
                      >
                        {formatStatus(appt.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
