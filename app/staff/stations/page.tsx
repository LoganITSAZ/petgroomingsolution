import { prisma } from "@/lib/prisma";
import { StationRole } from "@prisma/client";
import { KENNELABLE_STATUSES, kennelDemand } from "@/lib/kennels";
import { formatRole, formatServiceType, formatStatus, shopDayRange } from "@/lib/utils";
import { stationCapacity } from "@/lib/stations";
import Link from "next/link";
import { currentStaffIsAdmin } from "@/lib/staff-roles";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Stations" };

/**
 * Floor view of every station, grouped by role. Staff work stations here;
 * creating, renaming and removing them stays in the admin panel.
 */

const OCCUPYING = KENNELABLE_STATUSES.filter((status) => status !== "READY_PICKUP");

const ROLE_HEADING: Record<StationRole, string> = {
  GROOMER: "Groomer",
  BATHING: "Bathing",
  KENNEL: "Kennels",
};


/** Minutes since a moment, or null when it never started. */
function minutesSince(from: Date | null): number | null {
  if (!from) return null;
  return Math.max(0, Math.round((Date.now() - from.getTime()) / 60000));
}

export default async function StaffStationsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const isAdmin = await currentStaffIsAdmin();

  const { start, end } = shopDayRange();
  const [stations, occupying, demand] = await Promise.all([
    prisma.station.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        kennels: {
          select: {
            id: true,
            label: true,
            isActive: true,
            appointments: {
              where: { status: { in: KENNELABLE_STATUSES } },
              select: {
                id: true,
                status: true,
                kenneledAt: true,
                pet: { select: { name: true } },
                staff: { select: { name: true } },
              },
              orderBy: { kenneledAt: "asc" },
            },
          },
          orderBy: [{ row: "asc" }, { column: "asc" }],
        },
      },
    }),
    prisma.appointment.findMany({
      where: { status: { in: OCCUPYING }, stationId: { not: null } },
      include: {
        pet: { select: { id: true, name: true, hasBiteHistory: true } },
        customer: { select: { firstName: true, lastName: true } },
        staff: { select: { id: true, name: true } },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    kennelDemand(start, end),
  ]);

  // A station can hold more than one pet, so occupancy is a list.
  const occupantsByStation = new Map<string, typeof occupying>();
  for (const appointment of occupying) {
    const list = occupantsByStation.get(appointment.stationId as string) ?? [];
    list.push(appointment);
    occupantsByStation.set(appointment.stationId as string, list);
  }
  const active = stations.filter((s) => s.isActive);
  const inactive = stations.filter((s) => !s.isActive);

  const byRole = (role: StationRole) => active.filter((s) => s.role === role);
  const singleOccupancy = (role: StationRole) => {
    const list = byRole(role);
    return {
      list,
      used: list.reduce((n, s) => n + (occupantsByStation.get(s.id)?.length ?? 0), 0),
      capacity: list.reduce((n, s) => n + stationCapacity(s), 0),
    };
  };

  const grooming = singleOccupancy(StationRole.GROOMER);
  const bathing = singleOccupancy(StationRole.BATHING);
  const kennelUnits = byRole(StationRole.KENNEL);
  const kennelTotal = kennelUnits.reduce(
    (n, s) => n + s.kennels.filter((k) => k.isActive).length * demand.perCompartment,
    0
  );
  const kennelOccupied = kennelUnits.reduce(
    (n, s) => n + s.kennels.reduce((inside, k) => inside + k.appointments.length, 0),
    0
  );

  const summary = [
    grooming.list.length > 0 ? `${grooming.used}/${grooming.capacity} grooming in use` : null,
    bathing.list.length > 0 ? `${bathing.used}/${bathing.capacity} bathing in use` : null,
    kennelTotal > 0 ? `${kennelOccupied}/${kennelTotal} kennels occupied` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-stone-900">Stations</h1>
          <p className="text-sm text-stone-500 mt-1">
            {summary.length > 0 ? summary.join(" · ") : "Nothing configured yet."}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/stations"
            className="text-sm text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Add or edit stations →
          </Link>
        )}
      </div>

      {searchParams.error === "kennel_not_found" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          That kennel no longer exists.
        </div>
      )}

      {/* One pet at a time: grooming, then bathing */}
      {[
        { role: StationRole.GROOMER, ...grooming },
        { role: StationRole.BATHING, ...bathing },
      ].map(({ role, list, used, capacity }) =>
        list.length === 0 ? null : (
          <section key={role}>
            <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">
              {ROLE_HEADING[role]}{" "}
              <span className="text-stone-400">
                ({used}/{capacity} in use)
              </span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((station) => {
                const occupants = occupantsByStation.get(station.id) ?? [];
                const capacity = stationCapacity(station);
                const full = occupants.length >= capacity;

                return (
                  <Link
                    key={station.id}
                    href={`/staff/stations/${station.id}`}
                    className={`rounded-xl p-3 border transition-colors ${
                      occupants.length > 0
                        ? "bg-white border-stone-200 hover:border-amber-300"
                        : "bg-stone-50 border-dashed border-stone-300 hover:border-stone-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-stone-800 truncate">{station.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          full
                            ? "bg-red-100 text-red-700"
                            : occupants.length > 0
                              ? "bg-amber-100 text-amber-700"
                              : "bg-stone-200 text-stone-500"
                        }`}
                      >
                        {occupants.length}/{capacity}
                        {full ? " full" : ""}
                      </span>
                    </div>

                    {station.allowedRoles.length > 0 && (
                      <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-1">
                        {station.allowedRoles.map(formatRole).join(" or ")} only
                      </p>
                    )}

                    {occupants.length === 0 ? (
                      <p className="text-sm text-stone-400">No pet here right now.</p>
                    ) : (
                      <ul className="divide-y divide-stone-100 text-sm">
                        {occupants.map((appt) => {
                          const mins = minutesSince(appt.checkedInAt);
                          const over = appt.durationMins != null && mins != null && mins > appt.durationMins;
                          return (
                            <li key={appt.id} className="py-1">
                              <p className="font-bold text-stone-900 truncate">
                                {appt.pet.name}
                                {appt.pet.hasBiteHistory && (
                                  <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold align-middle">
                                    BITE
                                  </span>
                                )}
                                <span className="font-normal text-stone-500">
                                  {" "}
                                  · {appt.customer.firstName} {appt.customer.lastName}
                                </span>
                              </p>
                              <p className="text-xs flex justify-between gap-2">
                                <span className={appt.staff ? "text-stone-500" : "text-amber-700"}>
                                  {appt.staff?.name ?? "No groomer"} ·{" "}
                                  {appt.services[0]?.service?.name ??
                                    formatServiceType(appt.serviceType)}
                                  {appt.services.length > 1 && ` +${appt.services.length - 1}`}
                                </span>
                                <span className={over ? "text-red-600 font-semibold" : "text-stone-400"}>
                                  {mins == null ? formatStatus(appt.status) : `${mins}m`}
                                </span>
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )
      )}

      {/* Kennels */}
      {kennelUnits.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">
            {ROLE_HEADING.KENNEL}{" "}
            <span className="text-stone-400">
              ({kennelUnits.length} unit{kennelUnits.length !== 1 ? "s" : ""} ·{" "}
              {kennelOccupied}/{kennelTotal} occupied)
            </span>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {kennelUnits.map((station) => {
              const occupied = station.kennels.reduce(
                (inside, k) => inside + k.appointments.length,
                0
              );
              const outOfService = station.kennels.filter((k) => !k.isActive).length;
              return (
                <Link
                  key={station.id}
                  href={`/staff/stations/${station.id}`}
                  className="bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-stone-900 text-base truncate">
                      {station.name}
                    </span>
                    <span className="text-sm text-stone-500 whitespace-nowrap">
                      <span className="font-bold text-stone-900">{occupied}</span>/
                      {station.kennels.filter((k) => k.isActive).length * demand.perCompartment}{" "}
                      occupied
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {station.kennelRows ?? 0} rows × {station.kennelColumns ?? 0} doors
                    {outOfService > 0 && ` · ${outOfService} out of service`}
                  </p>
                  <div
                    className="grid gap-1 mt-3"
                    style={{
                      gridTemplateColumns: `repeat(${station.kennelColumns ?? 1}, minmax(0, 1fr))`,
                      maxWidth: `${(station.kennelColumns ?? 1) * 2.5}rem`,
                    }}
                  >
                    {station.kennels.map((kennel) => (
                      <span
                        key={kennel.id}
                        title={
                          kennel.appointments.length > 0
                            ? `${kennel.label}: ${kennel.appointments
                                .map((appt) => appt.pet.name)
                                .join(", ")}`
                            : kennel.label
                        }
                        className={`h-6 rounded text-[10px] font-semibold flex items-center justify-center ${
                          !kennel.isActive
                            ? "bg-stone-200 text-stone-400 line-through"
                            : kennel.appointments.length > 0
                              ? "bg-emerald-600 text-white"
                              : "bg-stone-100 text-stone-400"
                        }`}
                      >
                        {kennel.label}
                      </span>
                    ))}
                  </div>

                  {occupied > 0 && (
                    <ul className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-xs">
                      {station.kennels.flatMap((kennel) =>
                        kennel.appointments.map((appt) => {
                          const mins = minutesSince(appt.kenneledAt);
                          return (
                            <li key={appt.id} className="flex justify-between gap-3">
                              <span className="text-stone-700 truncate">
                                <span className="font-bold">{kennel.label}</span> {appt.pet.name}
                                {appt.staff && ` · ${appt.staff.name}`}
                              </span>
                              <span className="text-stone-400 whitespace-nowrap">
                                {formatStatus(appt.status)}
                                {mins != null && ` · ${mins} min`}
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
          Nothing active yet. An admin can add one from{" "}
          <Link href="/admin/stations/new" className="text-amber-700 hover:underline">
            the admin panel
          </Link>
          .
        </div>
      )}

      {inactive.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-400 mb-3 text-sm uppercase tracking-widest">
            Inactive ({inactive.length})
          </h2>
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {inactive.map((station) => (
              <div key={station.id} className="px-4 py-2 flex items-center justify-between">
                <span className="text-stone-500">{station.name}</span>
                <span className="text-xs text-stone-400">{ROLE_HEADING[station.role]}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
