import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900">My Pets</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {pets.length === 0 ? "No pets on file yet." : `${pets.length} pet${pets.length !== 1 ? "s" : ""} on file.`}
          </p>
        </div>
        <Link
          href="/portal/pets/new"
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + Add a Pet
        </Link>
      </div>

      {/* Pet cards */}
      {pets.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">🐾</p>
          <p className="text-stone-500 mb-4">You haven&apos;t added any pets yet.</p>
          <Link
            href="/portal/pets/new"
            className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Add your first pet →
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {pets.map((pet) => (
            <div
              key={pet.id}
              className="bg-white border border-stone-200 rounded-xl p-5 space-y-3 hover:border-amber-300 transition-colors"
            >
              {/* Pet name + bite badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{speciesEmoji[pet.species] ?? "🐾"}</span>
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
                  <dt className="text-stone-400 text-xs uppercase tracking-wide">Species</dt>
                  <dd className="text-stone-700 font-medium capitalize">
                    {pet.species.charAt(0) + pet.species.slice(1).toLowerCase()}
                  </dd>
                </div>
                {pet.weightLbs != null && (
                  <div>
                    <dt className="text-stone-400 text-xs uppercase tracking-wide">Weight</dt>
                    <dd className="text-stone-700 font-medium">{pet.weightLbs} lbs</dd>
                  </div>
                )}
                {pet.coatType && (
                  <div>
                    <dt className="text-stone-400 text-xs uppercase tracking-wide">Coat</dt>
                    <dd className="text-stone-700 font-medium">{coatLabel[pet.coatType] ?? pet.coatType}</dd>
                  </div>
                )}
                {pet.dateOfBirth && (
                  <div>
                    <dt className="text-stone-400 text-xs uppercase tracking-wide">Date of Birth</dt>
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

              {pet.groomingNotes && (
                <div className="bg-stone-50 rounded-lg px-3 py-2 text-xs text-stone-600">
                  <span className="font-semibold text-stone-500 uppercase tracking-wide">Notes: </span>
                  {pet.groomingNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
