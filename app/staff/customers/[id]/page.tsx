import { prisma } from "@/lib/prisma";
import { formatStatus, formatServiceType, formatSpecies } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

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
  params: { id: string };
}

export default async function CustomerDetailPage({ params }: PageProps) {
  let customer;
  try {
    customer = await prisma.customer.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        pets: { where: { isActive: true } },
        appointments: {
          include: { pet: true, station: true },
          orderBy: { scheduledAt: "desc" },
          take: 10,
        },
      },
    });
  } catch {
    notFound();
  }

  const memberSince = new Date(customer.createdAt ?? Date.now()).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/staff/directory"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        ← Back to Customers & Pets
      </Link>

      {/* Customer header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-stone-900">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
              <span>
                <span className="font-medium text-stone-700">Email:</span>{" "}
                <a href={`mailto:${customer.email}`} className="hover:text-amber-700 underline underline-offset-2">
                  {customer.email}
                </a>
              </span>
              {customer.phone && (
                <span>
                  <span className="font-medium text-stone-700">Phone:</span>{" "}
                  <a href={`tel:${customer.phone}`} className="hover:text-amber-700">
                    {customer.phone}
                  </a>
                </span>
              )}
              <span>
                <span className="font-medium text-stone-700">Member since:</span> {memberSince}
              </span>
            </div>
          </div>
          <Link
            href={`/staff/appointments/new?customerId=${customer.id}`}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Appointment
          </Link>
        </div>
      </div>

      {/* Pets section */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">
          Pets{" "}
          <span className="text-stone-400 font-normal text-base">({customer.pets.length})</span>
        </h2>
        {customer.pets.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400 text-sm">
            No active pets on file.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {customer.pets.map((pet) => (
              <Link
                key={pet.id}
                href={`/staff/pets/${pet.id}`}
                className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                      {pet.name}
                    </p>
                    <p className="text-sm text-stone-500 mt-0.5">
                      {formatSpecies(pet.species)}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                    </p>
                  </div>
                  {pet.hasBiteHistory && (
                    <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      ⚠ Bite
                    </span>
                  )}
                </div>
                {pet.weightLbs && (
                  <p className="text-xs text-stone-400 mt-2">{pet.weightLbs} lbs</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent appointments */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">Recent Appointments</h2>
        {customer.appointments.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400 text-sm">
            No appointments yet.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Pet</th>
                    <th className="px-4 py-3 text-left">Service</th>
                    <th className="px-4 py-3 text-left">Station</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {customer.appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                        {new Date(appt.scheduledAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        <span className="text-stone-400 ml-1.5">
                          {new Date(appt.scheduledAt).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">
                        <Link
                          href={`/staff/pets/${appt.pet.id}`}
                          className="hover:text-amber-700 underline underline-offset-2"
                        >
                          {appt.pet.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {formatServiceType(appt.serviceType)}
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {appt.station?.name ?? <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            statusColor[appt.status] ?? "bg-stone-100 text-stone-500"
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
          </div>
        )}
      </section>
    </div>
  );
}
