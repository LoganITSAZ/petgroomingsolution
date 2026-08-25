import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatSpecies } from "@/lib/utils";
import { rewardCards } from "@/lib/rewards";
import { RewardBadge } from "@/components/RewardCard";
import Link from "next/link";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Customers" };

/**
 * Customer directory. Pets are not a separate list: they live under their
 * owner here.
 *
 * Customers and pets are searched together: a single query matches owner name,
 * email or phone AND pet name or breed, and results are always rendered as
 * owner → pets so a hit on either side shows the whole relationship.
 */

const RESULT_LIMIT = 200;


interface PageProps {
  searchParams: { q?: string };
}

function petMatchesQuery(pet: { name: string; breed: string | null }, q: string): boolean {
  if (!q) return false;
  const needle = q.toLowerCase();
  return (
    pet.name.toLowerCase().includes(needle) ||
    (pet.breed?.toLowerCase().includes(needle) ?? false)
  );
}

export default async function StaffCustomersPage({ searchParams }: PageProps) {
  const q = searchParams.q?.trim() ?? "";

  // Pets shown (and, when a pet filter is active, the pets a customer must have)
  const petWhere: Prisma.PetWhereInput = { isActive: true };

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
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      pets: { where: petWhere, orderBy: { name: "asc" } },
      pricingTier: { select: { name: true, isActive: true } },
      _count: { select: { appointments: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: RESULT_LIMIT,
  });

  // Two queries for the whole page rather than two per row.
  const cards = await rewardCards(customers.map((customer) => customer.id));

  const shownPets = customers.reduce((n, c) => n + c.pets.length, 0);
  const biteFlagged = customers.reduce(
    (n, c) => n + c.pets.filter((p) => p.hasBiteHistory).length,
    0
  );
  const filtered = Boolean(q);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-stone-900">Customers</h1>
          <p className="text-sm text-stone-500 mt-1">
            Search owners and pets together — by owner name, email, phone, pet name or breed.
          </p>
        </div>
        <Link
          href="/staff/customers/new"
          className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          + New
        </Link>
      </div>

      {/* Search and filters, one line */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          type="search"
          aria-label="Search owners and pets"
          defaultValue={q}
          placeholder="Search owners and pets…"
          className="flex-1 min-w-[16rem] border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
        >
          Search
        </button>
        {filtered && (
          <Link href="/staff/customers" className="text-sm text-stone-400 hover:text-stone-600 underline">
            Clear
          </Link>
        )}
      </form>

      {/* Results */}
      {customers.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400">
          {filtered ? "No owners or pets match those filters." : "No active customers yet."}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/staff/customers/${customer.id}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 transition-colors"
            >
              {/* Owner */}
              <span className="min-w-0 w-56 shrink-0">
                <span className="block font-semibold text-stone-900 truncate">
                  {customer.lastName}, {customer.firstName}
                </span>
                <span className="block text-xs text-stone-400 truncate">
                  {customer.email}
                  {customer.phone && ` · ${customer.phone}`}
                </span>
              </span>

              {/* Their pets, as tags */}
              <span className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                {customer.pets.length === 0 ? (
                  <span className="text-xs text-stone-400">No pets on file</span>
                ) : (
                  customer.pets.map((pet) => {
                    const matched = petMatchesQuery(pet, q);
                    return (
                      <span
                        key={pet.id}
                        className={`inline-flex items-baseline gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                          matched
                            ? "border-amber-400 bg-amber-50"
                            : "border-stone-200 bg-stone-50"
                        }`}
                      >
                        <span className="font-semibold text-stone-800">{pet.name}</span>
                        <span className="text-stone-400">
                          {pet.breed ?? formatSpecies(pet.species)}
                        </span>
                        {pet.hasBiteHistory && (
                          <span className="text-[9px] font-bold text-red-700">BITE</span>
                        )}
                      </span>
                    );
                  })
                )}
              </span>

              <span className="flex items-center gap-1.5 shrink-0">
                {customer.pricingTier?.isActive && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
                    {customer.pricingTier.name}
                  </span>
                )}
                <RewardBadge card={cards.get(customer.id)} />
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  {customer._count.appointments} visit
                  {customer._count.appointments !== 1 ? "s" : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Counts, after the results they describe */}
      <div className="flex flex-wrap gap-3 text-sm text-stone-500 border-t border-stone-200 pt-3">
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
    </div>
  );
}
