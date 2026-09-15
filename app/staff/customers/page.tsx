import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatSpecies } from "@/lib/utils";
import { rewardCards } from "@/lib/rewards";
import { RewardBadge } from "@/components/RewardCard";
import Link from "next/link";
import ProfileAvatar from "@/components/ProfileAvatar";
import { photoUrl } from "@/lib/photos";
import OfficeIcon from "@/components/OfficeIcon";
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
      subtitle="Customer records and the pets in their care."
      className="customer-directory"
      columns={false}
      actions={
        <Link
          href="/staff/customers/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          + New customer
        </Link>
      }
    >
      {/* Search and filters, one line */}
      <PageSection tone="muted" className="directory-search">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <label htmlFor="customer-search" className="sr-only">Search customers and pets</label>
          <input
            id="customer-search"
            name="q"
            type="search"
            aria-label="Search owners and pets"
            defaultValue={q}
            placeholder="Name, email, phone, pet, or breed…"
            className="flex-1 min-w-0 basis-56 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-ink bg-surface"
          />
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Search
          </button>
          {filtered && (
            <Link href="/staff/customers" className="text-sm text-stone-400 hover:text-stone-600 underline">
              Clear
            </Link>
          )}
        </form>
      </PageSection>

      {/* Counts for what the search returned */}
      <StatStrip
        className="directory-stats"
        stats={[
          { label: customers.length === 1 ? "owner" : "owners", value: customers.length },
          { label: shownPets === 1 ? "pet" : "pets", value: shownPets },
          ...(biteFlagged > 0 ? [{ label: "with bite history", value: biteFlagged }] : []),
        ]}
      />

      {filtered && <p role="status" className="border-t border-line px-5 py-2 text-sm text-muted">
        {customers.length} matching customer{customers.length !== 1 ? "s" : ""} for <span className="font-semibold text-ink">“{q}”</span>
      </p>}

      {/* Results */}
      {customers.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-12">
            <span className="rounded-2xl bg-band p-4 text-brand-text"><OfficeIcon name="customers" /></span>
            <h2 className="text-lg font-bold text-ink">{filtered ? "No matching customers" : "Meet your first customer"}</h2>
            <p>{filtered ? "Try another name, phone number, pet, or breed." : "Add a customer to keep their pets and care details together."}</p>
            <Link href={filtered ? "/staff/customers" : "/staff/customers/new"} className="font-semibold text-brand-text underline underline-offset-4">
              {filtered ? "Clear search" : "Add a customer"}
            </Link>
          </div>
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false}>
          <div className="directory-column-labels" aria-hidden="true">
            <span>Customer & contact</span><span>Pets</span><span>Activity</span>
          </div>
          <ul className="divide-y divide-line">
            {customers.map((customer) => (
              <li key={customer.id} className="directory-row">
                <div className="flex min-w-0 items-start gap-3">
                  <ProfileAvatar src={photoUrl(customer.photoId)} name={`${customer.firstName} ${customer.lastName}`} />
                  <div className="min-w-0">
                    <Link href={`/staff/customers/${customer.id}`} className="font-semibold text-ink hover:text-brand-text hover:underline underline-offset-4">
                      {customer.lastName}, {customer.firstName}
                    </Link>
                    <a href={`mailto:${customer.email}`} className="mt-1 block break-all text-xs text-muted hover:text-brand-text">{customer.email}</a>
                    {customer.phone && <a href={`tel:${customer.phone}`} className="mt-1 block text-xs text-muted hover:text-brand-text">{customer.phone}</a>}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {customer.pets.length === 0 ? (
                    <span className="text-sm text-muted">No pets on file</span>
                  ) : customer.pets.map((pet) => (
                    <Link key={pet.id} href={`/staff/pets/${pet.id}`}
                      className={`directory-pet ${petMatchesQuery(pet, q) ? "border-brand-500 bg-brand-500/10" : "border-line bg-surface"}`}>
                      <ProfileAvatar src={photoUrl(pet.photoId) ?? pet.photoUrl} name={pet.name} pet size={32} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{pet.name}</span>
                        <span className="block text-xs text-muted">{pet.breed ?? formatSpecies(pet.species)}</span>
                      </span>
                      {pet.hasBiteHistory && <span className="rounded-md bg-red-100 px-1.5 py-1 text-xs font-bold text-red-700">Bite history</span>}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {customer.pricingTier?.isActive && (
                    <span className="rounded-full bg-brand-500/10 px-2 py-1 text-xs font-semibold text-brand-text">{customer.pricingTier.name}</span>
                  )}
                  <RewardBadge card={cards.get(customer.id)} />
                  <span className="text-xs text-muted">{customer._count.appointments} appointment{customer._count.appointments !== 1 ? "s" : ""}</span>
                  <Link href={`/staff/customers/${customer.id}`} aria-label={`View ${customer.firstName} ${customer.lastName}'s profile`} className="directory-open rounded-lg px-3 py-2 text-sm font-semibold text-brand-text hover:bg-brand-500/10">View →</Link>
                </div>
              </li>
            ))}
          </ul>
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
