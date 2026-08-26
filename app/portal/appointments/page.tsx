import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatStatus, formatServiceType } from "@/lib/utils";
import Link from "next/link";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My appointments" };

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-stone-100 text-stone-600",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DRYING: "bg-sky-100 text-sky-700",
  FINISHING: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-green-100 text-green-700",
  READY_PICKUP: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-stone-100 text-stone-400",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-400",
};

export default async function PortalAppointmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?type=customer");

  const customerId = session.user.id;
  const now = new Date();

  const appointments = await prisma.appointment.findMany({
    where: { customerId },
    include: {
      pet: true,
      station: true,
    },
    orderBy: { scheduledAt: "desc" },
  });

  const upcoming = appointments.filter(
    (a) => new Date(a.scheduledAt) >= now && a.status !== "CANCELLED" && a.status !== "NO_SHOW"
  );
  const past = appointments.filter(
    (a) => new Date(a.scheduledAt) < now || a.status === "CANCELLED" || a.status === "NO_SHOW"
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-stone-900">My Appointments</h1>
          <p className="text-stone-500 text-sm mt-0.5">View and manage your grooming appointments.</p>
        </div>
        <Link
          href="/portal/appointments/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + Book Appointment
        </Link>
      </div>

      {/* Upcoming */}
      <section>
        <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400">
            No upcoming appointments.{" "}
            <Link href="/portal/appointments/new" className="text-amber-700 hover:underline">
              Book one now →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appt={appt} statusColor={statusColor} />
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 mb-3 text-sm uppercase tracking-widest">
            Past Appointments ({past.length})
          </h2>
          <div className="space-y-3">
            {past.map((appt) => (
              <AppointmentCard key={appt.id} appt={appt} statusColor={statusColor} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AppointmentCard({
  appt,
  statusColor,
  muted = false,
}: {
  appt: {
    id: string;
    scheduledAt: Date;
    serviceType: string;
    status: string;
    appointmentType: string;
    pet: { name: string; species: string };
    station: { name: string } | null;
  };
  statusColor: Record<string, string>;
  muted?: boolean;
}) {
  const petEmoji = appt.pet.species === "CAT" ? "🐱" : appt.pet.species === "DOG" ? "🐶" : "🐾";
  const dateStr = new Date(appt.scheduledAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date(appt.scheduledAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={`bg-white border rounded-xl px-4 py-2.5 flex items-start justify-between gap-3 ${
        muted ? "border-stone-100 opacity-75" : "border-stone-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{petEmoji}</span>
        <div>
          <p className={`font-semibold ${muted ? "text-stone-600" : "text-stone-900"}`}>
            {appt.pet.name}
            {appt.appointmentType === "WALK_IN" && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                Walk-In
              </span>
            )}
          </p>
          <p className="text-sm text-stone-500 mt-0.5">
            {formatServiceType(appt.serviceType)} · {dateStr} at {timeStr}
          </p>
          {appt.station && (
            <p className="text-xs text-stone-400 mt-0.5">
              Station: {appt.station.name}
            </p>
          )}
        </div>
      </div>
      <span
        className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
          statusColor[appt.status] ?? "bg-stone-100 text-stone-500"
        }`}
      >
        {formatStatus(appt.status)}
      </span>
    </div>
  );
}
