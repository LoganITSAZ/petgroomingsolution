import { prisma } from "@/lib/prisma";
import { formatStatus, formatServiceType } from "@/lib/utils";
import Link from "next/link";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-stone-100 text-stone-600",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DRYING: "bg-sky-100 text-sky-700",
  FINISHING: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-green-100 text-green-700",
  READY_PICKUP: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-stone-100 text-stone-400",
  CANCELLED: "bg-red-100 text-red-500",
  NO_SHOW: "bg-red-100 text-red-400",
};

interface PageProps {
  searchParams: { date?: string };
}

export default async function StaffAppointmentsPage({ searchParams }: PageProps) {
  const dateStr = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    include: {
      pet: true,
      customer: { select: { firstName: true, lastName: true, phone: true } },
      station: true,
      staff: { select: { name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const displayDate = dayStart.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Appointments</h1>
          <p className="text-stone-500 text-sm mt-0.5">{displayDate}</p>
        </div>
        <Link
          href="/staff/appointments/new"
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + New Appointment
        </Link>
      </div>

      {/* Date filter */}
      <form method="GET" className="flex items-center gap-3">
        <label className="text-sm font-medium text-stone-600" htmlFor="date">
          Filter by date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          defaultValue={dateStr}
          className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          Go
        </button>
        {searchParams.date && (
          <Link href="/staff/appointments" className="text-sm text-stone-400 hover:text-stone-600 underline">
            Today
          </Link>
        )}
      </form>

      {/* Table */}
      {appointments.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-400">
          No appointments on {displayDate}.
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Pet</th>
                  <th className="px-4 py-3 text-left">Owner / Phone</th>
                  <th className="px-4 py-3 text-left">Service</th>
                  <th className="px-4 py-3 text-left">Station</th>
                  <th className="px-4 py-3 text-left">Staff</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt, i) => (
                  <tr
                    key={appt.id}
                    className={`border-t border-stone-100 ${i % 2 === 0 ? "bg-white" : "bg-stone-50"}`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-800 whitespace-nowrap">
                      {new Date(appt.scheduledAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {appt.appointmentType === "WALK_IN" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                          Walk-In
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-stone-100 text-stone-600">
                          Appt
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-stone-900">{appt.pet.name}</span>
                      {appt.pet.hasBiteHistory && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                          BITE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      <span>
                        {appt.customer.firstName} {appt.customer.lastName}
                      </span>
                      {appt.customer.phone && (
                        <span className="block text-xs text-stone-400">{appt.customer.phone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {formatServiceType(appt.serviceType)}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {appt.station?.displayLabel ?? appt.station?.name ?? (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {appt.staff?.name ?? <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          statusColor[appt.status] ?? "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {formatStatus(appt.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/appointments/${appt.id}`}
                        className="text-amber-700 hover:text-amber-900 font-medium text-xs hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-stone-100 text-xs text-stone-400">
            {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
