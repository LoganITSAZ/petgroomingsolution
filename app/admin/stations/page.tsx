import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function StationsPage() {
  const stations = await prisma.station.findMany({
    orderBy: { name: "asc" },
  });

  const activeCount = stations.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Grooming Stations</h1>
          <p className="text-sm text-stone-500 mt-1">
            {activeCount} of {stations.length} station{stations.length !== 1 ? "s" : ""} active.
          </p>
        </div>
        <Link
          href="/admin/stations/new"
          className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + Add Station
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Total Stations</p>
          <p className="text-3xl font-bold text-stone-800 mt-1">{stations.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Active</p>
          <p className="text-3xl font-bold text-green-700 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Inactive</p>
          <p className="text-3xl font-bold text-stone-400 mt-1">{stations.length - activeCount}</p>
        </div>
      </div>

      {/* Stations table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {stations.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-sm">
            No stations configured yet.{" "}
            <Link href="/admin/stations/new" className="text-amber-700 hover:underline font-medium">
              Add your first station.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Display Label
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {stations.map((station) => (
                <tr key={station.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center flex-shrink-0">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                          />
                        </svg>
                      </div>
                      <span className="font-medium text-stone-800">{station.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-stone-500">
                    {station.displayLabel ?? (
                      <span className="text-stone-300 italic">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
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
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/stations/${station.id}/edit`}
                      className="text-amber-700 hover:text-amber-900 text-xs font-medium"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
