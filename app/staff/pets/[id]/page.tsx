import { prisma } from "@/lib/prisma";
import {
  formatStatus,
  formatServiceType,
  formatSpecies,
  formatCoatType,
} from "@/lib/utils";
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

const visitEventLabel: Record<string, string> = {
  REWASH: "Re-wash",
  BITE: "Bite",
  BEHAVIORAL: "Behavioral",
  INJURY: "Injury",
  MATTING_FOUND: "Matting Found",
  EQUIPMENT_ISSUE: "Equipment Issue",
  OTHER: "Other",
};

const visitEventColor: Record<string, string> = {
  REWASH: "bg-sky-100 text-sky-700",
  BITE: "bg-red-100 text-red-700",
  BEHAVIORAL: "bg-orange-100 text-orange-700",
  INJURY: "bg-rose-100 text-rose-700",
  MATTING_FOUND: "bg-yellow-100 text-yellow-700",
  EQUIPMENT_ISSUE: "bg-stone-100 text-stone-600",
  OTHER: "bg-stone-100 text-stone-500",
};

interface PageProps {
  params: { id: string };
}

export default async function PetDetailPage({ params }: PageProps) {
  let pet;
  try {
    pet = await prisma.pet.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        appointments: {
          include: {
            station: true,
            staff: { select: { name: true } },
          },
          orderBy: { scheduledAt: "desc" },
          take: 10,
        },
      },
    });
  } catch {
    notFound();
  }

  // VisitEvent hangs off Appointment, not Pet — reach it through the appointment.
  const visitEvents = await prisma.visitEvent.findMany({
    where: { appointment: { petId: params.id } },
    include: { loggedBy: { select: { name: true } } },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  const age = pet.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(pet.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/staff/directory"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        ← Back to Customers & Pets
      </Link>

      {/* Bite history banner */}
      {pet.hasBiteHistory && (
        <div className="bg-red-600 text-white rounded-xl px-5 py-4 flex items-center gap-3 font-bold text-sm shadow-sm">
          <span className="text-xl">⚠</span>
          <span>BITE HISTORY — Handle with extreme caution</span>
        </div>
      )}

      {/* Pet header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-stone-900">{pet.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
              <span>
                <span className="font-medium text-stone-700">Species:</span>{" "}
                {formatSpecies(pet.species)}
              </span>
              {pet.breed && (
                <span>
                  <span className="font-medium text-stone-700">Breed:</span> {pet.breed}
                </span>
              )}
              {pet.weightLbs != null && (
                <span>
                  <span className="font-medium text-stone-700">Weight:</span> {pet.weightLbs} lbs
                </span>
              )}
              {age !== null && (
                <span>
                  <span className="font-medium text-stone-700">Age:</span> {age}{" "}
                  {age === 1 ? "year" : "years"}
                </span>
              )}
              {pet.dateOfBirth && (
                <span>
                  <span className="font-medium text-stone-700">DOB:</span>{" "}
                  {new Date(pet.dateOfBirth).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {pet.coatType && (
                <span>
                  <span className="font-medium text-stone-700">Coat:</span>{" "}
                  {formatCoatType(pet.coatType)}
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/staff/appointments/new?petId=${pet.id}&customerId=${pet.customer.id}`}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Appointment
          </Link>
        </div>
      </div>

      {/* Two-column info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Owner card */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">Owner</h2>
          <p className="font-bold text-stone-900">
            {pet.customer.firstName} {pet.customer.lastName}
          </p>
          <p className="text-sm text-stone-500 mt-0.5">
            <a href={`mailto:${pet.customer.email}`} className="hover:text-amber-700 underline underline-offset-2">
              {pet.customer.email}
            </a>
          </p>
          {pet.customer.phone && (
            <p className="text-sm text-stone-500 mt-0.5">
              <a href={`tel:${pet.customer.phone}`} className="hover:text-amber-700">
                {pet.customer.phone}
              </a>
            </p>
          )}
          <Link
            href={`/staff/customers/${pet.customer.id}`}
            className="inline-block mt-3 text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
          >
            View customer profile →
          </Link>
        </div>

        {/* Health flags */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">
            Health Flags
          </h2>
          {pet.healthFlags.length === 0 ? (
            <p className="text-sm text-stone-400">None on file.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pet.healthFlags.map((flag) => (
                <span
                  key={flag}
                  className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Grooming notes */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">
            Grooming Notes
          </h2>
          {pet.groomingNotes ? (
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{pet.groomingNotes}</p>
          ) : (
            <p className="text-sm text-stone-400">No grooming notes.</p>
          )}
        </div>

        {/* Temperament notes */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">
            Temperament Notes
          </h2>
          {pet.temperamentNotes ? (
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{pet.temperamentNotes}</p>
          ) : (
            <p className="text-sm text-stone-400">No temperament notes.</p>
          )}
        </div>
      </div>

      {/* Visit event log */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">Visit Events</h2>
        {visitEvents.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400 text-sm">
            No visit events recorded.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
            {visitEvents.map((event) => (
              <div key={event.id} className="px-5 py-4 flex items-start gap-4">
                <span
                  className={`flex-shrink-0 mt-0.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                    visitEventColor[event.eventType] ?? "bg-stone-100 text-stone-500"
                  }`}
                >
                  {visitEventLabel[event.eventType] ?? event.eventType}
                </span>
                <div className="flex-1 min-w-0">
                  {event.note && (
                    <p className="text-sm text-stone-700">{event.note}</p>
                  )}
                  <p className="text-xs text-stone-400 mt-1">
                    {new Date(event.occurredAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {event.loggedBy && (
                      <span className="ml-2">· Logged by {event.loggedBy.name}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Appointment history */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">Appointment History</h2>
        {pet.appointments.length === 0 ? (
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
                    <th className="px-4 py-3 text-left">Service</th>
                    <th className="px-4 py-3 text-left">Station</th>
                    <th className="px-4 py-3 text-left">Groomer</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {pet.appointments.map((appt) => (
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
                      <td className="px-4 py-3 text-stone-700">
                        {formatServiceType(appt.serviceType)}
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {appt.station?.name ?? <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {appt.staff?.name ?? <span className="text-stone-300">—</span>}
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
