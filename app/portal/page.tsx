import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatStatus, formatServiceType } from "@/lib/utils";

export default async function PortalDashboard() {
  const session = await auth();
  const customerId = session!.user.id;

  const [customer, upcomingAppointments, pets] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { waiverAcceptances: true },
    }),
    prisma.appointment.findMany({
      where: {
        customerId,
        status: { notIn: ["PICKED_UP", "CANCELLED", "NO_SHOW"] },
      },
      include: { pet: true, station: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.pet.findMany({
      where: { customerId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-stone-900">
          Welcome back, {customer?.firstName}!
        </h1>
        <p className="text-stone-500 text-sm mt-1">Manage your pets and appointments.</p>
      </div>

      {/* Upcoming appointments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-stone-800">Upcoming Appointments</h2>
          <Link href="/portal/appointments/new" className="text-sm text-brand-600 hover:underline font-medium">
            + Book new
          </Link>
        </div>
        {upcomingAppointments.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">
            No upcoming appointments.{" "}
            <Link href="/portal/appointments/new" className="text-brand-600 hover:underline">
              Book one now →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingAppointments.map((appt) => (
              <div key={appt.id} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">{appt.pet.name}</p>
                  <p className="text-sm text-stone-500">
                    {formatServiceType(appt.serviceType)} ·{" "}
                    {new Date(appt.scheduledAt).toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="text-sm font-medium bg-stone-100 text-stone-600 px-3 py-1 rounded-full">
                  {formatStatus(appt.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pets */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-stone-800">My Pets</h2>
          <Link href="/portal/pets/new" className="text-sm text-brand-600 hover:underline font-medium">
            + Add pet
          </Link>
        </div>
        {pets.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">
            No pets yet.{" "}
            <Link href="/portal/pets/new" className="text-brand-600 hover:underline">
              Add your first pet →
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {pets.map((pet) => (
              <Link
                key={pet.id}
                href={`/portal/pets/${pet.id}`}
                className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-brand-300 transition-colors"
              >
                <span className="text-3xl">{pet.species === "CAT" ? "🐱" : "🐶"}</span>
                <div>
                  <p className="font-semibold text-stone-900">{pet.name}</p>
                  <p className="text-sm text-stone-500">{pet.breed ?? pet.species}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
