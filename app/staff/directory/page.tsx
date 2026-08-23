import { prisma } from "@/lib/prisma";
import { Prisma, Species } from "@prisma/client";
import { formatSpecies, formatCoatType } from "@/lib/utils";
import Link from "next/link";

/**
 * Unified customer + pet directory.
 *
 * Customers and pets are searched together: a single query matches owner name,
 * email or phone AND pet name or breed, and results are always rendered as
 * owner → pets so a hit on either side shows the whole relationship.
 */

const RESULT_LIMIT = 200;

const speciesBadge: Record<string, string> = {
  DOG: "bg-amber-100 text-amber-700",
  CAT: "bg-sky-100 text-sky-700",
  OTHER: "bg-stone-100 text-stone-600",
};

interface PageProps {
  searchParams: { q?: string; species?: string; flag?: string };
}

function buildHref(
  current: { q: string; species?: Species; biteOnly: boolean },
  patch: { species?: Species | null; biteOnly?: boolean }
): string {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);

  const species = patch.species === undefined ? current.species : patch.species ?? undefined;
  if (species) params.set("species", species);

  const biteOnly = patch.biteOnly === undefined ? current.biteOnly : patch.biteOnly;
  if (biteOnly) params.set("flag", "bite");

  const qs = params.toString();
  return qs ? `/staff/directory?${qs}` : "/staff/directory";
}

function petMatchesQuery(pet: { name: string; breed: string | null }, q: string): boolean {
  if (!q) return false;
  const needle = q.toLowerCase();
  return (
    pet.name.toLowerCase().includes(needle) ||
    (pet.breed?.toLowerCase().includes(needle) ?? false)
  );
}

export default async function StaffDirectoryPage({ searchParams }: PageProps) {
  const q = searchParams.q?.trim() ?? "";
  const speciesFilter = Object.values(Species).includes(searchParams.species as Species)
    ? (searchParams.species as Species)
    : undefined;
  const biteOnly = searchParams.flag === "bite";
  const petFilterActive = Boolean(speciesFilter || biteOnly);

  // Pets shown (and, when a pet filter is active, the pets a customer must have)
  const petWhere: Prisma.PetWhereInput = {
    isActive: true,
    ...(speciesFilter ? { species: speciesFilter } : {}),
    ...(biteOnly ? { hasBiteHistory: true } : {}),
  };

  const textOr: Prisma.CustomerWhereInput[] = [];
  if (q) {
    textOr.push(
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      {
        pets: {
          some: {
            ...petWhere,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { breed: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      }
    );

    // "jane doe" — first and last name across two columns
    const terms = q.split(/\s+/).filter(Boolean);
    if (terms.length > 1) {
      textOr.push({
        AND: [
          { firstName: { contains: terms[0], mode: "insensitive" } },
          { lastName: { contains: terms[terms.length - 1], mode: "insensitive" } },
        ],
      });
    }
  }

  const where: Prisma.CustomerWhereInput = {
    isActive: true,
    ...(textOr.length ? { OR: textOr } : {}),
    ...(petFilterActive ? { pets: { some: petWhere } } : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      pets: { where: petWhere, orderBy: { name: "asc" } },
      _count: { select: { appointments: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: RESULT_LIMIT,
  });

  const shownPets = customers.reduce((n, c) => n + c.pets.length, 0);
  const biteFlagged = customers.reduce(
    (n, c) => n + c.pets.filter((p) => p.hasBiteHistory).length,
    0
  );
  const filtered = Boolean(q) || petFilterActive;
  const current = { q, species: speciesFilter, biteOnly };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900">Customers &amp; Pets</h1>
        <p className="text-sm text-stone-500 mt-1">
          Search owners and pets together — by owner name, email, phone, pet name or breed.
        </p>
      </div>

      {/* Search */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search owners and pets…"
          className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-800 w-80 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {speciesFilter && <input type="hidden" name="species" value={speciesFilter} />}
        {biteOnly && <input type="hidden" name="flag" value="bite" />}
        <button
          type="submit"
          className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          Search
        </button>
        {filtered && (
          <Link href="/staff/directory" className="text-sm text-stone-400 hover:text-stone-600 underline">
            Clear all
          </Link>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-400 uppercase tracking-widest font-semibold mr-1">Pets</span>
        <Link
          href={buildHref(current, { species: null })}
          className={`px-3 py-1 rounded-full font-medium transition-colors ${
            !speciesFilter ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          All species
        </Link>
        {Object.values(Species).map((s) => (
          <Link
            key={s}
            href={buildHref(current, { species: s })}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${
              speciesFilter === s
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {formatSpecies(s)}
          </Link>
        ))}
        <span className="w-px h-4 bg-stone-200 mx-1" />
        <Link
          href={buildHref(current, { biteOnly: !biteOnly })}
          className={`px-3 py-1 rounded-full font-medium transition-colors ${
            biteOnly ? "bg-red-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          ⚠ Bite history only
        </Link>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-6 text-sm text-stone-500 border-y border-stone-200 py-3">
        <span>
          <span className="font-bold text-stone-900">{customers.length}</span> owner
          {customers.length !== 1 ? "s" : ""}
        </span>
        <span>
          <span className="font-bold text-stone-900">{shownPets}</span> pet
          {shownPets !== 1 ? "s" : ""}
        </span>
        {biteFlagged > 0 && (
          <span className="text-red-600">
            <span className="font-bold">{biteFlagged}</span> with bite history
          </span>
        )}
        {customers.length === RESULT_LIMIT && (
          <span className="text-stone-400">
            Showing the first {RESULT_LIMIT} owners — narrow the search to see more.
          </span>
        )}
      </div>

      {/* Results */}
      {customers.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-400">
          {filtered ? "No owners or pets match those filters." : "No active customers yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-white border border-stone-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-3 gap-5"
            >
              {/* Owner */}
              <div className="lg:border-r lg:border-stone-100 lg:pr-5">
                <Link
                  href={`/staff/customers/${customer.id}`}
                  className="font-bold text-stone-900 hover:text-amber-700 transition-colors"
                >
                  {customer.lastName}, {customer.firstName}
                </Link>
                <p className="text-sm text-stone-500 mt-1 break-all">
                  <a
                    href={`mailto:${customer.email}`}
                    className="hover:text-amber-700 underline underline-offset-2"
                  >
                    {customer.email}
                  </a>
                </p>
                {customer.phone && (
                  <p className="text-sm text-stone-500 mt-0.5">
                    <a href={`tel:${customer.phone}`} className="hover:text-amber-700">
                      {customer.phone}
                    </a>
                  </p>
                )}
                <p className="text-xs text-stone-400 mt-2">
                  {customer._count.appointments} appointment
                  {customer._count.appointments !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Pets */}
              <div className="lg:col-span-2">
                {customer.pets.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    {petFilterActive ? "No pets match the current filters." : "No pets on file."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customer.pets.map((pet) => {
                      const matched = petMatchesQuery(pet, q);
                      return (
                        <Link
                          key={pet.id}
                          href={`/staff/pets/${pet.id}`}
                          className={`border rounded-lg px-3 py-2 hover:border-amber-300 hover:bg-amber-50/40 transition-colors ${
                            matched ? "border-amber-400 bg-amber-50/60" : "border-stone-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-stone-900 text-sm truncate">
                              {pet.name}
                            </span>
                            <span className="flex items-center gap-1 flex-shrink-0">
                              {pet.hasBiteHistory && (
                                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  BITE
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  speciesBadge[pet.species] ?? "bg-stone-100 text-stone-500"
                                }`}
                              >
                                {formatSpecies(pet.species)}
                              </span>
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5 truncate">
                            {pet.breed ?? "Breed not recorded"}
                            {pet.coatType ? ` · ${formatCoatType(pet.coatType)} coat` : ""}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
