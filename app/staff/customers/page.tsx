import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatSpecies } from "@/lib/utils";
import { rewardCards } from "@/lib/rewards";
import { RewardBadge } from "@/components/RewardCard";
import Link from "next/link";
import { PageShell, PageSection, StatStrip } from "@/components/ui";

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
  searchParams: Promise<{ q?: string }>;
}

function petMatchesQuery(pet: { name: string; breed: string | null }, q: string): boolean {
  if (!q) return false;
  const needle = q.toLowerCase();
  return (
    pet.name.toLowerCase().includes(needle) ||
    (pet.breed?.toLowerCase().includes(needle) ?? false)
  );
}

export default async function StaffCustomersPage(props: PageProps) {
  const searchParams = await props.searchParams;
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
    <PageShell
      title="Customers"
      subtitle="Search owners and pets together — by owner name, email, phone, pet name or breed."
    >
      {/* Search and filters, one line */}
      <PageSection tone="muted">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            type="search"
            aria-label="Search owners and pets"
            defaultValue={q}
            placeholder="Search owners and pets…"
            className="flex-1 min-w-[16rem] border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-800 bg-white"
          />
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Search
          </button>
          <Link
            href="/staff/customers/new"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New
          </Link>
          {filtered && (
            <Link href="/staff/customers" className="text-sm text-stone-400 hover:text-stone-600 underline">
              Clear
            </Link>
          )}
        </form>
      </PageSection>

      {/* Counts for what the search returned */}
      <StatStrip
        stats={[
          { label: customers.length === 1 ? "owner" : "owners", value: customers.length },
          { label: shownPets === 1 ? "pet" : "pets", value: shownPets },
          ...(biteFlagged > 0 ? [{ label: "with bite history", value: biteFlagged }] : []),
        ]}
      />

      {/* Results */}
      {customers.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          {filtered ? "No owners or pets match those filters." : "No active customers yet."}
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false}>
          <div className="divide-y divide-stone-100">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/staff/customers/${customer.id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-well transition-colors"
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
        </PageSection>
      )}

      {customers.length === RESULT_LIMIT && (
        <p className="px-3 py-2 border-t border-stone-100 text-xs text-stone-400">
          Showing the first {RESULT_LIMIT} owners — narrow the search to see more.
        </p>
      )}
    </PageShell>
  );
}
