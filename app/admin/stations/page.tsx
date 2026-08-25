import { prisma } from "@/lib/prisma";
import { StationRole } from "@prisma/client";
import Link from "next/link";
import { formatRole } from "@/lib/utils";
import { KENNELABLE_STATUSES } from "@/lib/kennels";
import { getConfig } from "@/lib/config";
import { saveCapacityRules } from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Stations" };

const ROLE_LABEL: Record<StationRole, string> = {
  GROOMER: "Groomer",
  BATHING: "Bathing",
  KENNEL: "Kennel Unit",
};

const ROLE_BADGE: Record<StationRole, string> = {
  GROOMER: "bg-amber-100 text-amber-700",
  BATHING: "bg-sky-100 text-sky-700",
  KENNEL: "bg-emerald-100 text-emerald-700",
};

interface PageProps {
  searchParams: {
    created?: string;
    saved?: string;
    kept?: string;
    capacity?: string;
    error?: string;
  };
}

export default async function StationsPage({ searchParams }: PageProps) {
  const config = await getConfig();
  const stations = await prisma.station.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { kennels: true } },
      kennels: {
        select: {
          id: true,
          _count: { select: { appointments: { where: { status: { in: KENNELABLE_STATUSES } } } } },
        },
      },
    },
  });

  const activeCount = stations.filter((s) => s.isActive).length;
  const kennelStations = stations.filter((s) => s.role === StationRole.KENNEL);
  const kennelTotal = kennelStations.reduce((n, s) => n + s._count.kennels, 0);
  const kennelOccupied = kennelStations.reduce(
    (n, s) => n + s.kennels.reduce((inside, kennel) => inside + kennel._count.appointments, 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Stations</h1>
          <p className="text-sm text-stone-500 mt-1">
            {activeCount} of {stations.length} station{stations.length !== 1 ? "s" : ""} active.
            Each station carries a role that decides how it is used on the floor.
          </p>
        </div>
        <Link
          href="/admin/stations/new"
          className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          + Add Station
        </Link>
      </div>

      {searchParams.created && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          {searchParams.created} created.
        </div>
      )}
      {searchParams.saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          {searchParams.saved} saved.
          {searchParams.kept && (
            <span className="font-normal">
              {" "}
              {searchParams.kept} stayed in place — still occupied.
            </span>
          )}
        </div>
      )}
      {searchParams.error === "not_found" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          That station no longer exists.
        </div>
      )}

      {searchParams.capacity === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Capacity rules saved.
        </div>
      )}
      {searchParams.error === "invalid_capacity" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-800 text-sm font-medium">
          A compartment holds between 1 and 4 pets.
        </div>
      )}

      {/* Capacity rules, shop-wide */}
      <form
        action={saveCapacityRules}
        className="bg-white border border-stone-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-3"
      >
        <span className="text-sm font-semibold text-stone-800">Capacity</span>
        <span className="text-sm text-stone-500">
          Groom tables and bathing stations hold one pet each.
        </span>
        <span className="flex items-center gap-2 ml-auto">
          <label htmlFor="kennelCapacityPerCompartment" className="text-sm text-stone-600">
            Pets per kennel compartment
          </label>
          <input
            id="kennelCapacityPerCompartment"
            name="kennelCapacityPerCompartment"
            type="number"
            min={1}
            max={4}
            defaultValue={config.kennelCapacityPerCompartment}
            className="w-16 border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
          >
            Save
          </button>
        </span>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Total Stations</p>
          <p className="text-2xl font-bold text-stone-800 mt-1">{stations.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Inactive</p>
          <p className="text-2xl font-bold text-stone-400 mt-1">{stations.length - activeCount}</p>
        </div>
        <Link
          href="/staff/stations"
          className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-300 transition-colors"
        >
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Kennels In Use</p>
          <p className="text-2xl font-bold text-stone-800 mt-1">
            {kennelOccupied}
            <span className="text-base font-medium text-stone-400">/{kennelTotal}</span>
          </p>
        </Link>
      </div>

      {/* Stations table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {stations.length === 0 ? (
          <div className="py-8 text-center text-stone-400 text-sm">
            No stations configured yet.{" "}
            <Link href="/admin/stations/new" className="text-amber-700 hover:underline font-medium">
              Add your first station.
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-left">
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Layout
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide text-right">
                    Touchscreen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {stations.map((station) => (
                  <tr key={station.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/stations/${station.id}/edit`}
                        className="font-medium text-stone-800 hover:text-amber-700 transition-colors"
                      >
                        {station.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[station.role]}`}
                      >
                        {ROLE_LABEL[station.role]}
                      </span>
                      {station.allowedRoles.length > 0 && (
                        <span className="block text-xs text-stone-400 mt-1">
                          {station.allowedRoles.map(formatRole).join(" or ")} only
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">
                      {station.role === StationRole.KENNEL ? (
                        <>
                          {station.kennelRows ?? 0} × {station.kennelColumns ?? 0}
                          <span className="text-stone-400">
                            {" "}
                            ·{" "}
                            {station.kennels.reduce(
                              (inside, kennel) => inside + kennel._count.appointments,
                              0
                            )}{" "}
                            in {station._count.kennels} doors
                          </span>
                        </>
                      ) : (
                        <span className="text-stone-400">One pet at a time</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {station.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700 text-xs font-medium">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-stone-400 text-xs font-medium">
                          <span className="w-2 h-2 rounded-full bg-stone-300" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link
                        href={`/station/${station.id}`}
                        className="text-stone-400 hover:text-stone-700 text-xs font-medium"
                      >
                        Open display
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
