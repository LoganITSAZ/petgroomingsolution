import { prisma } from "@/lib/prisma";
import {
  formatShopDate,
  formatStatus,
  formatServiceType,
  formatSpecies,
  formatCoatType,
  statusBadgeClass,
} from "@/lib/utils";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import PhotoUpload from "@/components/PhotoUpload";
import InsightList from "@/components/InsightList";
import { petInsights } from "@/lib/insights";
import { setPetPhoto } from "@/app/staff/customers/actions";
import { photoUrl } from "@/lib/photos";
import ModalButton from "@/components/ModalButton";
import { PetForm, healthFlagOptions } from "@/app/staff/customers/PetForm";
import { notFound } from "next/navigation";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Pet" };


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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string; updated?: string; error?: string }>;
}

export default async function PetDetailPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  let pet;
  try {
    pet = await prisma.pet.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, photoId: true },
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

  const insights = await petInsights(params.id);
  const flagOptions = await healthFlagOptions();

  const age = pet.dateOfBirth
    ? Math.floor(
        (new Date().getTime() - new Date(pet.dateOfBirth).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  return (
    <PageShell
      back={{ href: "/staff/customers", label: "Back to Customers" }}
      title={pet.name}
      subtitle={`${formatSpecies(pet.species)}${pet.breed ? ` · ${pet.breed}` : ""}`}
      className="max-w-5xl w-full"
    >

      {searchParams.updated === "1" && <p role="status" className="px-3 py-2 text-green-800 text-sm">Profile updated.</p>}
      {searchParams.error === "pet_name" && <p role="alert" className="px-3 py-2 text-red-800 text-sm">A pet needs a name.</p>}
      {searchParams.error === "bad_weight" && <p role="alert" className="px-3 py-2 text-red-800 text-sm">Enter a valid weight greater than zero.</p>}
      {searchParams.photo === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Photo updated.
        </p>
      )}
      {searchParams.error?.startsWith("photo_") && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {searchParams.error === "photo_too_large"
            ? "Photos have to be 2 MB or smaller."
            : "Photos must be JPEG, PNG or WebP."}
        </p>
      )}

      {/* Bite history banner */}
      {pet.hasBiteHistory && (
        <div className="border-t border-stone-100 bg-red-600 text-white px-3 py-2.5 flex items-center gap-3 font-bold text-sm">
          <span className="text-xl" aria-hidden="true">⚠</span>
          <span>BITE HISTORY — Handle with extreme caution</span>
        </div>
      )}

      {/* Pet header */}
      <PageSection
        title="Profile Details"
        actions={
          <>
          <ModalButton label="Edit Profile" title={`Edit ${pet.name}`} variant="secondary">
            <PetForm customerId={pet.customer.id} pet={pet} flagOptions={flagOptions} returnToPet />
          </ModalButton>
            <Link
              href={`/staff/appointments/new?petId=${pet.id}&customerId=${pet.customer.id}`}
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
            >
              + New Appointment
            </Link>
          </>
        }
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <PhotoUpload
              action={setPetPhoto}
              idField="petId"
              idValue={pet.id}
              currentUrl={photoUrl(pet.photoId) ?? pet.photoUrl}
              label={pet.name}
            />
            <div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5 text-sm text-stone-500">
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
              {pet.sex !== "UNKNOWN" && (
                <span>
                  <span className="font-medium text-stone-700">Sex:</span>{" "}
                  {pet.sex === "MALE" ? "Male" : "Female"}
                </span>
              )}
            </div>
            </div>
          </div>

        </div>
      </PageSection>

      {insights.length > 0 && (
        <PageSection title="What past visits show">
          <InsightList insights={insights} compact />
        </PageSection>
      )}


        {/* Owner card */}
        <PageSection title="Owner">
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
        </PageSection>

        {/* Health flags */}
        <PageSection title="Health Flags">
          {/* Vaccinations sit with the flags because they are the same question
              a groomer asks before the pet is on the table. Unconfirmed is
              stated rather than left blank: silence reads as fine. */}
          <p className="mb-3 text-sm">
            {pet.vaccinationsConfirmedAt ? (
              <span className="text-stone-700">
                <span className="font-medium text-green-700">✓ Vaccinations confirmed</span>{" "}
                <span className="text-stone-500">
                  on {formatShopDate(pet.vaccinationsConfirmedAt)}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-2.5 py-1">
                ⚠ Vaccinations not confirmed
              </span>
            )}
          </p>
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
        </PageSection>

        {/* Grooming notes */}
        <PageSection title="Grooming Notes">
          {pet.groomingNotes ? (
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{pet.groomingNotes}</p>
          ) : (
            <p className="text-sm text-stone-400">No grooming notes.</p>
          )}
        </PageSection>

        {/* Temperament notes */}
        <PageSection title="Temperament Notes">
          {pet.temperamentNotes ? (
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{pet.temperamentNotes}</p>
          ) : (
            <p className="text-sm text-stone-400">No temperament notes.</p>
          )}
        </PageSection>

      {/* Visit event log */}
      <PageSection title="Visit Events">
        {visitEvents.length === 0 ? (
          <div className="border border-stone-200 rounded-lg bg-well p-4 text-center text-stone-400 text-sm">
            No visit events recorded.
          </div>
        ) : (
          <div className="border border-well-line rounded-lg overflow-hidden divide-y divide-stone-100">
            {visitEvents.map((event) => (
              <div key={event.id} className="px-4 py-2.5 flex items-start gap-3">
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
      </PageSection>

      {/* Appointment history */}
      <PageSection title="Appointment History">
        {pet.appointments.length === 0 ? (
          <div className="border border-stone-200 rounded-lg bg-well p-4 text-center text-stone-400 text-sm">
            No appointments yet.
          </div>
        ) : (
          <div className="border border-well-line rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-well text-stone-500 text-xs tracking-tight">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Date</th>
                    <th scope="col" className="px-3 py-2 text-left">Service</th>
                    <th scope="col" className="px-3 py-2 text-left">Station</th>
                    <th scope="col" className="px-3 py-2 text-left">Groomer</th>
                    <th scope="col" className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {pet.appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-well transition-colors">
                      <td className="px-3 py-2 text-stone-600 whitespace-nowrap">
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
                      <td className="px-3 py-2 text-stone-700">
                        {formatServiceType(appt.serviceType)}
                      </td>
                      <td className="px-3 py-2 text-stone-500">
                        {appt.station?.name ?? <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-stone-500">
                        {appt.staff?.name ?? <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            statusBadgeClass(appt.status)
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
      </PageSection>
    </PageShell>
  );
}
