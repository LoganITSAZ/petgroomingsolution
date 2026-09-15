import { prisma } from "@/lib/prisma";
import { StationRole } from "@prisma/client";
import Link from "next/link";
import { formatRole, formatStationRole, stationRoleBadgeClass } from "@/lib/utils";
import { KENNELABLE_STATUSES } from "@/lib/kennels";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Manage Stations" };


interface PageProps {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    kept?: string;
    error?: string;
  }>;
}

export default async function StationsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const stations = await prisma.station.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          kennels: true,
          appointments: { where: { status: { in: OCCUPYING_STATUSES } } },
        },
      },
      kennels: {
        select: {
          id: true,
          _count: { select: { appointments: { where: { status: { in: KENNELABLE_STATUSES } } } } },
        },
      },
    },
  });

  const inServiceCount = stations.filter((s) => s.isActive).length;
  const kennelStations = stations.filter((s) => s.role === StationRole.KENNEL);
  // Doors, not slots: a compartment's second space only exists for a pet that
  // can share with whoever is already inside, so the free-slot count is not
  // space the shop can promise.
  const kennelTotal = kennelStations.reduce((n, s) => n + s._count.kennels, 0);
  const kennelOccupied = kennelStations.reduce(
    (n, s) => n + s.kennels.filter((kennel) => kennel._count.appointments > 0).length,
    0
  );
  // In service is a setting; in use is what the floor is doing right now. A
  // kennel unit is in use when any of its doors holds a pet, a work station
  // when a visit is standing at it.
  const inUseCount = stations.filter((s) =>
    s.role === StationRole.KENNEL
      ? s.kennels.some((kennel) => kennel._count.appointments > 0)
      : s._count.appointments > 0
  ).length;

  return (
    <PageShell
      title="Manage Stations"
      columns={false}
      actions={
        <Link
          href="/admin/stations/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          + Add Station
        </Link>
      }
    >

      {searchParams.created && (
        <SaveToast>
          {searchParams.created} created.
        </SaveToast>
      )}
      {searchParams.saved && (
        <SaveToast>
          {searchParams.saved} saved.
          {searchParams.kept && (
            <span className="font-normal">
              {" "}
              {searchParams.kept} stayed in place — still occupied.
            </span>
          )}
        </SaveToast>
      )}
      {searchParams.error === "not_found" && (
        <SaveToast tone="error">
          That station no longer exists.
        </SaveToast>
      )}

      {/* Summary cards */}
      <PageSection bodyClassName="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-stone-200 rounded-lg bg-well p-4">
          <p className="text-xs font-semibold text-stone-400 tracking-tight">Total Stations</p>
          <p className="text-2xl font-bold text-stone-800 mt-1">{stations.length}</p>
        </div>
        <div className="border border-stone-200 rounded-lg bg-well p-4">
          <p className="text-xs font-semibold text-stone-400 tracking-tight">In Use Now</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {inUseCount}
            <span className="text-base font-medium text-stone-400">/{inServiceCount}</span>
          </p>
        </div>
        <div className="border border-stone-200 rounded-lg bg-well p-4">
          <p className="text-xs font-semibold text-stone-400 tracking-tight">Out Of Service</p>
          <p className="text-2xl font-bold text-stone-400 mt-1">{stations.length - inServiceCount}</p>
        </div>
        <Link
          href="/staff/stations"
          className="border border-stone-200 rounded-lg bg-well p-4 hover:border-amber-300 transition-colors"
        >
          <p className="text-xs font-semibold text-stone-400 tracking-tight">Kennels In Use</p>
          <p className="text-2xl font-bold text-stone-800 mt-1">
            {kennelOccupied}
            <span className="text-base font-medium text-stone-400">/{kennelTotal}</span>
          </p>
        </Link>
            </PageSection>

      {/* Stations table */}
      <PageSection grow scroll padded={false}>
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
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                    Layout
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight text-right">
                    Touchscreen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {stations.map((station) => (
                  <tr key={station.id} className="hover:bg-well transition-colors">
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
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stationRoleBadgeClass(station.role)}`}
                      >
                        {formatStationRole(station.role)}
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
                            in {station._count.kennels} doors ·{" "}
                            {station.kennelCapacityPerCompartment} per door,{" "}
                            {station.kennelHouseholdMaxPerCompartment} from one household
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
      </PageSection>
    </PageShell>
  );
}
