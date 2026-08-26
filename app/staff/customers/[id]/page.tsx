import { prisma } from "@/lib/prisma";
import { formatStatus, formatServiceType, formatSpecies, formatCoatType } from "@/lib/utils";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { notFound } from "next/navigation";
import {
  redeemCustomerReward,
  saveAlternateContact,
  removeAlternateContact,
  setCustomerAddress,
  setCustomerPhoto,
  setPreferredGroomer,
  setPricingTier,
  savePet,
  removePet,
} from "../actions";
import { describeRate, listPricingTiers } from "@/lib/pricing-tiers";
import { rewardCard, rewardHistory } from "@/lib/rewards";
import RewardCard from "@/components/RewardCard";
import { formatShopDate } from "@/lib/utils";
import { customerInsights } from "@/lib/insights";
import InsightList from "@/components/InsightList";
import PhotoUpload from "@/components/PhotoUpload";
import ModalButton from "@/components/ModalButton";
import AddressMap from "@/components/AddressMap";
import AddressLink from "@/components/AddressLink";
import { photoUrl } from "@/lib/photos";
import { CoatType, Species } from "@prisma/client";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Customer" };

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

interface PageProps {
  params: { id: string };
  searchParams: {
    created?: string;
    groomer?: string;
    photo?: string;
    alt?: string;
    alt_removed?: string;
    pet?: string;
    pet_removed?: string;
    rate?: string;
    redeemed?: string;
    error?: string;
  };
}

/** Add or edit one approved alternate. No `alternate` is the add case. */
function AlternateForm({
  customerId,
  alternate,
}: {
  customerId: string;
  alternate?: { id: string; name: string; phone: string | null; email: string | null };
}) {
  return (
    <form action={saveAlternateContact} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
      <input type="hidden" name="customerId" value={customerId} />
      {alternate && <input type="hidden" name="alternateId" value={alternate.id} />}
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Name</span>
        <input
          name="name"
          required
          defaultValue={alternate?.name ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Phone</span>
        <input
          name="phone"
          defaultValue={alternate?.phone ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Email</span>
        <input
          name="email"
          type="email"
          defaultValue={alternate?.email ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <div className="sm:col-span-3 flex justify-end">
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          Save
        </button>
      </div>
    </form>
  );
}

/** The address form, behind the + and the Edit button. */
function AddressForm({ customer }: { customer: { id: string; address: string | null } }) {
  return (
    <form action={setCustomerAddress} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customer.id} />
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Street address</span>
        <textarea
          name="address"
          rows={3}
          defaultValue={customer.address ?? ""}
          placeholder="123 Main St, Phoenix, AZ 85020"
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-none"
        />
      </label>
      <button
        type="submit"
        className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold self-end"
      >
        Save
      </button>
    </form>
  );
}

/** Add or edit a pet. No `pet` is the add case — the action reads it the same way. */
function PetForm({
  customerId,
  pet,
}: {
  customerId: string;
  pet?: {
    id: string;
    name: string;
    species: Species;
    breed: string | null;
    weightLbs: number | null;
    coatType: CoatType | null;
    groomingNotes: string | null;
    temperamentNotes: string | null;
  };
}) {
  return (
    <form action={savePet} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      {pet && <input type="hidden" name="petId" value={pet.id} />}
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Name</span>
        <input
          name="name"
          required
          defaultValue={pet?.name ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Species</span>
        <select
          name="species"
          defaultValue={pet?.species ?? Species.DOG}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          {Object.values(Species).map((species) => (
            <option key={species} value={species}>
              {formatSpecies(species)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Breed</span>
        <input
          name="breed"
          defaultValue={pet?.breed ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Weight (lbs)</span>
        <input
          name="weightLbs"
          type="number"
          min="1"
          step="0.1"
          defaultValue={pet?.weightLbs ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Coat</span>
        <select
          name="coatType"
          defaultValue={pet?.coatType ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Not recorded</option>
          {Object.values(CoatType).map((coat) => (
            <option key={coat} value={coat}>
              {formatCoatType(coat)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Grooming notes</span>
        <textarea
          name="groomingNotes"
          rows={2}
          defaultValue={pet?.groomingNotes ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-y"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Temperament notes</span>
        <textarea
          name="temperamentNotes"
          rows={2}
          defaultValue={pet?.temperamentNotes ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-y"
        />
      </label>
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          Save
        </button>
      </div>
    </form>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  let customer;
  try {
    customer = await prisma.customer.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        pets: { where: { isActive: true } },
        alternateContacts: { orderBy: { createdAt: "asc" } },
        appointments: {
          include: { pet: true, station: true },
          orderBy: { scheduledAt: "desc" },
          take: 10,
        },
        preferredStaff: { select: { id: true, name: true, defaultStation: { select: { name: true } } } },
        pricingTier: true,
        photo: { select: { id: true } },
      },
    });
  } catch {
    notFound();
  }

  const insights = await customerInsights(params.id);

  const [tiers, card, redemptions] = await Promise.all([
    listPricingTiers(),
    rewardCard(params.id),
    rewardHistory(params.id, 5),
  ]);

  const groomers = await prisma.staff.findMany({
    where: { isActive: true, roles: { hasSome: ["GROOMER", "BATHER"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const memberSince = new Date(customer.createdAt ?? Date.now()).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <PageShell
      back={{ href: "/staff/customers", label: "Back to Customers" }}
      title={`${customer.firstName} ${customer.lastName}`}
      subtitle={`Member since ${memberSince}`}
      className="max-w-5xl mx-auto w-full"
    >

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

      {searchParams.groomer === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Groomer updated.
        </p>
      )}

      {searchParams.created === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Customer created.
        </p>
      )}

      {/* Customer header */}
      <PageSection>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <PhotoUpload
              action={setCustomerPhoto}
              idField="customerId"
              idValue={customer.id}
              currentUrl={photoUrl(customer.photoId)}
              label={`${customer.firstName} ${customer.lastName}`}
            />
            <div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5 text-sm text-stone-500">
              <span>
                <span className="font-medium text-stone-700">Email:</span>{" "}
                <a href={`mailto:${customer.email}`} className="hover:text-amber-700 underline underline-offset-2">
                  {customer.email}
                </a>
              </span>
              {customer.phone && (
                <span>
                  <span className="font-medium text-stone-700">Phone:</span>{" "}
                  <a href={`tel:${customer.phone}`} className="hover:text-amber-700">
                    {customer.phone}
                  </a>
                </span>
              )}
              {customer.address && (
                <span>
                  <span className="font-medium text-stone-700">Address:</span>{" "}
                  <AddressLink address={customer.address} />
                </span>
              )}
              <span>
                <span className="font-medium text-stone-700">Member since:</span> {memberSince}
              </span>
              <span>
                <span className="font-medium text-stone-700">Preferred groomer:</span>{" "}
                {customer.preferredStaff
                  ? `${customer.preferredStaff.name}${
                      customer.preferredStaff.defaultStation
                        ? ` · ${customer.preferredStaff.defaultStation.name}`
                        : ""
                    }`
                  : "assigned at check-in"}
              </span>
            </div>
            </div>
          </div>
          <form action={setPreferredGroomer} className="flex items-center gap-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <span className="text-sm text-stone-500">Preferred groomer</span>
            <select
              name="preferredStaffId"
              aria-label="Preferred groomer"
              defaultValue={customer.preferredStaffId ?? ""}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Decide at check-in</option>
              {groomers.map((groomer) => (
                <option key={groomer.id} value={groomer.id}>
                  {groomer.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
            >
              Save
            </button>
          </form>

          <Link
            href={`/staff/appointments/new?customerId=${customer.id}`}
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Appointment
          </Link>
        </div>
      </PageSection>

      {searchParams.rate === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Pricing saved. It applies from the next booking — visits already quoted keep their price.
        </p>
      )}
      {searchParams.redeemed === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Reward redeemed.
        </p>
      )}
      {searchParams.error === "redeem_failed" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          Nothing to redeem — the card may have been used on another screen.
        </p>
      )}

      {/* What this customer pays, and what they have earned */}
      <PageSection bodyClassName="grid gap-3 md:grid-cols-2">
        <div className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="text-sm font-bold text-stone-800">Pricing</h2>

          {customer.pricingTier ? (
            <p className="mt-2 text-sm">
              <span className="font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {customer.pricingTier.name}
              </span>{" "}
              <span className="text-stone-600">{describeRate(customer.pricingTier)}</span>
              {!customer.pricingTier.isActive && (
                <span className="block text-xs text-stone-500 mt-1">
                  This rate is switched off, so list prices apply.
                </span>
              )}
              {customer.pricingTier.note && (
                <span className="block text-xs text-stone-500 mt-1">
                  {customer.pricingTier.note}
                </span>
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Published prices.</p>
          )}

          {customer.pricingNotes && (
            <p className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 whitespace-pre-wrap">
              {customer.pricingNotes}
            </p>
          )}

          <form action={setPricingTier} className="mt-3 space-y-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <label className="text-sm block" htmlFor="pricingTierId">
              <span className="block font-medium text-stone-700 mb-1">Rate</span>
              <select
                id="pricingTierId"
                name="pricingTierId"
                defaultValue={customer.pricingTierId ?? ""}
                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Published prices</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} — {describeRate(tier)}
                    {tier.isActive ? "" : " (off)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm block" htmlFor="pricingNotes">
              <span className="block font-medium text-stone-700 mb-1">Note for the counter</span>
              <textarea
                id="pricingNotes"
                name="pricingNotes"
                rows={2}
                defaultValue={customer.pricingNotes ?? ""}
                placeholder="Anything about this customer's price that the rate does not cover."
                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-y"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
              >
                Save pricing
              </button>
            </div>
          </form>
        </div>

        {card.enabled && (
          <div className="border border-stone-200 rounded-lg bg-well p-4">
            <h2 className="text-sm font-bold text-stone-800">Rewards</h2>

            <div className="mt-2">
              <RewardCard card={card} />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              {card.punches} finished visit{card.punches !== 1 ? "s" : ""} on record ·{" "}
              {card.redeemed} redeemed
            </p>

            {card.available > 0 && (
              <form action={redeemCustomerReward} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="customerId" value={customer.id} />
                <label className="text-sm flex-1" htmlFor="redeem-note">
                  <span className="block font-medium text-stone-700 mb-1">Note (optional)</span>
                  <input
                    id="redeem-note"
                    name="note"
                    placeholder="What they took"
                    className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap"
                >
                  Redeem
                </button>
              </form>
            )}

            {redemptions.length > 0 && (
              <ul className="mt-3 border-t border-stone-100 pt-2 space-y-1">
                {redemptions.map((redemption) => (
                  <li key={redemption.id} className="text-xs text-stone-500">
                    {formatShopDate(redemption.redeemedAt)} · {redemption.label}
                    {redemption.staff && ` · ${redemption.staff.name}`}
                    {redemption.note && ` · ${redemption.note}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
            </PageSection>

      {searchParams.alt === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Approved alternate saved.
        </p>
      )}
      {searchParams.alt_removed === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Approved alternate removed.
        </p>
      )}
      {searchParams.error === "alt_name" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          An approved alternate needs a name.
        </p>
      )}
      {searchParams.pet === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Pet saved.
        </p>
      )}
      {searchParams.pet_removed === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Pet removed from this profile.
        </p>
      )}
      {searchParams.error === "pet_name" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          A pet needs a name.
        </p>
      )}
      {searchParams.error === "bad_weight" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          That weight does not look right.
        </p>
      )}
      {searchParams.error === "alt_email" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          That alternate email address does not look valid.
        </p>
      )}

      {/* Where they are — for pickups, drop-offs and checking the service area */}
      <PageSection title="Address">
        {customer.address ? (
          <div className="border border-stone-200 rounded-lg bg-well p-4 grid gap-3 md:grid-cols-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-stone-700 whitespace-pre-wrap">{customer.address}</p>
              <div className="flex flex-none items-center gap-2">
                <ModalButton
                  label="Edit"
                  title="Address"
                  description="Where this customer is."
                  variant="secondary"
                >
                  <AddressForm customer={customer} />
                </ModalButton>
                {/* A blank address clears the column, so removal is the same action. */}
                <form action={setCustomerAddress}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <button
                    type="submit"
                    className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
            <AddressMap
              address={customer.address}
              title={`Map showing ${customer.firstName} ${customer.lastName}'s address`}
              height={170}
              compact
            />
          </div>
        ) : (
          <ModalButton
            label="Add an Address +"
            title="Address"
            description="Where this customer is."
            variant="secondary"
          >
            <AddressForm customer={customer} />
          </ModalButton>
        )}
      </PageSection>

      {/* Who else may hand over or collect the pets */}
      <PageSection title={`Approved Alternates (${customer.alternateContacts.length})`}>
        <div className="flex flex-col gap-2 items-start">
          {customer.alternateContacts.map((alternate) => (
            <div
              key={alternate.id}
              className="w-full border border-stone-200 rounded-lg bg-well p-3 flex items-start justify-between gap-3"
            >
              <div className="text-sm min-w-0">
                <p className="font-bold text-stone-800">{alternate.name}</p>
                {alternate.phone && <p className="text-stone-600">{alternate.phone}</p>}
                {alternate.email && <p className="text-stone-600 truncate">{alternate.email}</p>}
              </div>
              <div className="flex flex-none items-center gap-2">
                <ModalButton
                  label="Edit"
                  title={`Edit ${alternate.name}`}
                  description="Who else may drop off or collect this customer's pets."
                  variant="secondary"
                >
                  <AlternateForm customerId={customer.id} alternate={alternate} />
                </ModalButton>
                <form action={removeAlternateContact}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <input type="hidden" name="alternateId" value={alternate.id} />
                  <button
                    type="submit"
                    className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}

          <ModalButton
            label="Add an Approved Alternate +"
            title="Approved alternate"
            description="Who else may drop off or collect this customer's pets."
            variant="secondary"
          >
            <AlternateForm customerId={customer.id} />
          </ModalButton>
        </div>
      </PageSection>

      {insights.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-1.5">
            What their history shows
          </h2>
          <InsightList insights={insights} compact />
        </section>
      )}

      {/* Pets section */}
      <PageSection title={`Pets (${customer.pets.length})`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {customer.pets.map((pet) => (
            <div
              key={pet.id}
              className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/staff/pets/${pet.id}`} className="group min-w-0">
                  <p className="font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                    {pet.name}
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {formatSpecies(pet.species)}
                    {pet.breed ? ` · ${pet.breed}` : ""}
                  </p>
                  {pet.weightLbs && (
                    <p className="text-xs text-stone-400 mt-2">{pet.weightLbs} lbs</p>
                  )}
                </Link>
                {pet.hasBiteHistory && (
                  <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    ⚠ Bite
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2">
                <ModalButton
                  label="Edit"
                  title={`Edit ${pet.name}`}
                  description="What the groomer needs to know about this pet."
                  variant="secondary"
                >
                  <PetForm customerId={customer.id} pet={pet} />
                </ModalButton>
                <form action={removePet}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <input type="hidden" name="petId" value={pet.id} />
                  <button
                    type="submit"
                    className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-center rounded-xl border border-dashed border-stone-300 bg-well p-4">
            <ModalButton
              label="Add a Pet +"
              title="Add a pet"
              description={`A pet on ${customer.firstName} ${customer.lastName}'s profile.`}
              variant="secondary"
            >
              <PetForm customerId={customer.id} />
            </ModalButton>
          </div>
        </div>
      </PageSection>

      {/* Recent appointments */}
      <PageSection title="Recent Appointments">
        {customer.appointments.length === 0 ? (
          <div className="border border-stone-200 rounded-lg bg-well p-4 text-center text-stone-400 text-sm">
            No appointments yet.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-well text-stone-500 text-xs uppercase tracking-widest">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Date</th>
                    <th scope="col" className="px-3 py-2 text-left">Pet</th>
                    <th scope="col" className="px-3 py-2 text-left">Service</th>
                    <th scope="col" className="px-3 py-2 text-left">Station</th>
                    <th scope="col" className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {customer.appointments.map((appt) => (
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
                      <td className="px-3 py-2 font-medium text-stone-800">
                        <Link
                          href={`/staff/pets/${appt.pet.id}`}
                          className="hover:text-amber-700 underline underline-offset-2"
                        >
                          {appt.pet.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-stone-600">
                        {formatServiceType(appt.serviceType)}
                      </td>
                      <td className="px-3 py-2 text-stone-500">
                        {appt.station?.name ?? <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            statusColor[appt.status] ?? "bg-stone-100 text-stone-500"
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
