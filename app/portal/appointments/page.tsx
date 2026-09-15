import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatStatus, formatServiceType, statusBadgeClass } from "@/lib/utils";
import Link from "next/link";
import { PageShell, PageSection, Well } from "@/components/ui";
import VisitPhotoStrip from "@/components/VisitPhotoStrip";
import { getConfig } from "@/lib/config";
import { formatShopDate } from "@/lib/utils";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My appointments" };

export default async function PortalAppointmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?type=customer");

  const customerId = session.user.id;
  const now = new Date();

  const config = await getConfig();

  const appointments = await prisma.appointment.findMany({
    where: { customerId },
    include: {
      pet: true,
      station: true,
      // Only what a groomer ticked. The bytes are gated the same way in
      // /api/photos/[id], so an id guessed from this page is still refused.
      photos: { where: { ownerVisible: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const photographed = appointments.filter((appt) => appt.photos.length > 0);

  const upcoming = appointments.filter(
    (a) => new Date(a.scheduledAt) >= now && a.status !== "CANCELLED" && a.status !== "NO_SHOW"
  );
  const past = appointments.filter(
    (a) => new Date(a.scheduledAt) < now || a.status === "CANCELLED" || a.status === "NO_SHOW"
  );

  return (
    <PageShell
      title="My Appointments"
      subtitle="Your grooming visits, booked and past."
      actions={
        <Link
          href="/portal/appointments/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Book a visit
        </Link>
      }
    >
      <PageSection title={`Upcoming (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <Well className="py-2 text-sm text-stone-500">
            Nothing booked.{" "}
            <Link href="/portal/appointments/new" className="text-brand-text hover:underline">
              Book a visit
            </Link>
          </Well>
        ) : (
          <Well as="ul" className="px-0 py-0 divide-y divide-well-line">
            {upcoming.map((appt) => (
              <AppointmentRow key={appt.id} appt={appt} />
            ))}
          </Well>
        )}
      </PageSection>

      {/* The finished dog is what an owner actually came back for. Only the
          photos the shop chose to share appear here. */}
      {config.featureVisitPhotos && photographed.length > 0 && (
        <PageSection title="Photos of your visits">
          <div className="space-y-4">
            {photographed.slice(0, 5).map((appt) => (
              <div key={appt.id}>
                <p className="text-sm font-semibold text-stone-700 mb-1.5">
                  {appt.pet.name} · {formatShopDate(appt.scheduledAt)}
                </p>
                <VisitPhotoStrip photos={appt.photos} petName={appt.pet.name} />
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {/* History is the reason someone scrolls past what is booked. It opens
          on request rather than pushing the next visit off the screen. */}
      {past.length > 0 && (
        <PageSection>
          <details className="disclosure">
            <summary className="font-display text-[0.8125rem] font-bold tracking-tight text-stone-600">
              Past visits ({past.length})
            </summary>
            <Well as="ul" className="mt-2 px-0 py-0 divide-y divide-well-line">
              {past.map((appt) => (
                <AppointmentRow key={appt.id} appt={appt} muted />
              ))}
            </Well>
          </details>
        </PageSection>
      )}
    </PageShell>
  );
}

function AppointmentRow({
  appt,
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
    <li className="px-3 py-2 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5" aria-hidden="true">{petEmoji}</span>
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
            <p className="text-xs text-stone-400 mt-0.5">Station: {appt.station.name}</p>
          )}
        </div>
      </div>
      <span
        className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${statusBadgeClass(appt.status)}`}
      >
        {formatStatus(appt.status)}
      </span>
    </li>
  );
}
