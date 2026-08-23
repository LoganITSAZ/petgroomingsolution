import { prisma } from "@/lib/prisma";
import { formatStatus, formatServiceType } from "@/lib/utils";
import Link from "next/link";

export default async function StaffDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayAppointments, activeByStation] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: today, lt: tomorrow },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: {
        pet: true,
        customer: { select: { firstName: true, lastName: true, phone: true } },
        station: true,
        staff: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        stationId: { not: null },
        status: { notIn: ["COMPLETE", "READY_PICKUP", "PICKED_UP", "CANCELLED", "NO_SHOW"] },
      },
      include: {
        pet: true,
        customer: { select: { firstName: true, lastName: true } },
        station: true,
      },
    }),
  ]);

  const statusColor: Record<string, string> = {
    SCHEDULED: "bg-stone-100 text-stone-600",
    CHECKED_IN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    DRYING: "bg-sky-100 text-sky-700",
    FINISHING: "bg-purple-100 text-purple-700",
    COMPLETE: "bg-green-100 text-green-700",
    READY_PICKUP: "bg-emerald-100 text-emerald-800",
    PICKED_UP: "bg-stone-100 text-stone-400",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-stone-900">
          Today — {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h1>
        <Link
          href="/staff/appointments/new"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + New Appointment
        </Link>
      </div>

      {/* Active at stations */}
      {activeByStation.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">Active at Stations</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeByStation.map((appt) => (
              <div key={appt.id} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-stone-400 uppercase">{appt.station?.displayLabel ?? appt.station?.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[appt.status] ?? ""}`}>
                    {formatStatus(appt.status)}
                  </span>
                </div>
                <p className="font-bold text-stone-900">{appt.pet.name}</p>
                <p className="text-sm text-stone-500">{appt.customer.firstName} {appt.customer.lastName}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All today's appointments */}
      <section>
        <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">All Today ({todayAppointments.length})</h2>
        {todayAppointments.length === 0 ? (
          <p className="text-stone-400 text-sm">No appointments today.</p>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Pet</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Service</th>
                  <th className="px-4 py-3 text-left">Station</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {todayAppointments.map((appt, i) => (
                  <tr key={appt.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                    <td className="px-4 py-3 font-medium">
                      {new Date(appt.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-stone-900">{appt.pet.name}</span>
                      {appt.pet.hasBiteHistory && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">BITE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {appt.customer.firstName} {appt.customer.lastName}
                      {appt.customer.phone && <span className="block text-xs text-stone-400">{appt.customer.phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{formatServiceType(appt.serviceType)}</td>
                    <td className="px-4 py-3 text-stone-500">{appt.station?.displayLabel ?? appt.station?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[appt.status] ?? ""}`}>
                        {formatStatus(appt.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
