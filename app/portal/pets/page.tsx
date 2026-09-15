import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell, PageSection, Well } from "@/components/ui";
import { getConfig } from "@/lib/config";
import { checksForPets } from "@/lib/vaccinations";
import { VaccinationRows } from "@/components/Vaccinations";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My pets" };

const speciesEmoji: Record<string, string> = {
  DOG: "🐶",
  CAT: "🐱",
  OTHER: "🐾",
};

const coatLabel: Record<string, string> = {
  SHORT: "Short coat",
  MEDIUM: "Medium coat",
  LONG: "Long coat",
  DOUBLE: "Double coat",
  CURLY: "Curly coat",
  WIRE: "Wire coat",
  HAIRLESS: "Hairless",
};

export default async function PortalPetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?type=customer");

  const customerId = session.user.id;

  const pets = await prisma.pet.findMany({
    where: { customerId, isActive: true },
    orderBy: { name: "asc" },
  });

  /*
   * What the shop checks, shown to the owner rather than only to the counter.
   * Nothing is editable here: a record is the shop reading a certificate, so an
   * owner brings or emails proof and the shop writes it down.
   */
  const config = await getConfig();
  const vaccinationChecks = await checksForPets(
    pets.map((pet) => pet.id),
    config
  );

  return (
    <PageShell
      title="My Pets"
      subtitle={pets.length === 0 ? "None on file yet." : `${pets.length} on file.`}
      actions={
        <Link
          href="/portal/pets/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Add a pet
        </Link>
      }
    >
      <PageSection>
        {pets.length === 0 ? (
          <Well className="py-4 text-center">
            <p className="text-3xl mb-2" aria-hidden="true">🐾</p>
            <p className="text-stone-500 text-sm mb-3">Nothing here until you add a pet.</p>
            <Link
              href="/portal/pets/new"
              className="inline-block bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Add your first pet
            </Link>
          </Well>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {pets.map((pet) => (
              <div
                key={pet.id}
                className="rounded-lg border border-well-line bg-well p-3 space-y-3"
              >
                {/* Pet name + bite badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">{speciesEmoji[pet.species] ?? "🐾"}</span>
                    <div>
                      <p className="font-bold text-stone-900 text-lg leading-tight">{pet.name}</p>
                      {pet.breed && (
                        <p className="text-sm text-stone-500">{pet.breed}</p>
                      )}
                    </div>
                  </div>
                  {pet.hasBiteHistory && (
                    <span className="shrink-0 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">
                      Bite History on file
                    </span>
                  )}
                </div>

                {/* Details */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <dt className="text-stone-400 text-xs tracking-tight">Species</dt>
                    <dd className="text-stone-700 font-medium capitalize">
                      {pet.species.charAt(0) + pet.species.slice(1).toLowerCase()}
                    </dd>
                  </div>
                  {pet.weightLbs != null && (
                    <div>
                      <dt className="text-stone-400 text-xs tracking-tight">Weight</dt>
                      <dd className="text-stone-700 font-medium">{pet.weightLbs} lbs</dd>
                    </div>
                  )}
                  {pet.coatType && (
                    <div>
                      <dt className="text-stone-400 text-xs tracking-tight">Coat</dt>
                      <dd className="text-stone-700 font-medium">{coatLabel[pet.coatType] ?? pet.coatType}</dd>
                    </div>
                  )}
                  {pet.dateOfBirth && (
                    <div>
                      <dt className="text-stone-400 text-xs tracking-tight">Date of Birth</dt>
                      <dd className="text-stone-700 font-medium">
                        {new Date(pet.dateOfBirth).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </dd>
                    </div>
                  )}
                </dl>

                {(vaccinationChecks.get(pet.id) ?? []).length > 0 && (
                  <div className="rounded-lg bg-white border border-well-line px-3 py-2">
                    <p className="text-xs font-semibold text-stone-500 tracking-tight">
                      Vaccinations
                    </p>
                    <VaccinationRows checks={vaccinationChecks.get(pet.id) ?? []} />
                    <p className="mt-1 text-xs text-stone-400">
                      {config.vaccinationGateBlocks
                        ? "A booking needs these current. Email or bring the certificate and we will update it."
                        : "Bring or email the certificate and we will update it."}
                    </p>
                  </div>
                )}

                {pet.groomingNotes && (
                  <div className="rounded-lg bg-white border border-well-line px-3 py-2 text-xs text-stone-600">
                    <span className="font-semibold text-stone-500 tracking-tight">Notes: </span>
                    {pet.groomingNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
