import { prisma } from "@/lib/prisma";
import { formatStatus, formatServiceType, formatSpecies } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  redeemCustomerReward,
  setAlternateContact,
  setCustomerAddress,
  setCustomerPhoto,
  setPreferredGroomer,
  setPricingTier,
} from "../actions";
import { describeRate, listPricingTiers } from "@/lib/pricing-tiers";
import { rewardCard, rewardHistory } from "@/lib/rewards";
import RewardCard from "@/components/RewardCard";
import { formatShopDate } from "@/lib/utils";
import { customerInsights } from "@/lib/insights";
import InsightList from "@/components/InsightList";
import PhotoUpload from "@/components/PhotoUpload";
import AddressMap from "@/components/AddressMap";
import AddressLink from "@/components/AddressLink";
import { photoUrl } from "@/lib/photos";

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
    rate?: string;
    redeemed?: string;
    error?: string;
  };
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  let customer;
  try {
    customer = await prisma.customer.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        pets: { where: { isActive: true } },
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/staff/customers"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        ← Back to Customers
      </Link>

      {searchParams.photo === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Photo updated.
        </div>
      )}
      {searchParams.error?.startsWith("photo_") && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-800 text-sm font-medium">
          {searchParams.error === "photo_too_large"
            ? "Photos have to be 2 MB or smaller."
            : "Photos must be JPEG, PNG or WebP."}
        </div>
      )}

      {searchParams.groomer === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Groomer updated.
        </div>
      )}

      {searchParams.created === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          Customer created.
        </div>
      )}

      {/* Customer header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4">
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
            <h1 className="text-xl font-black text-stone-900">
              {customer.firstName} {customer.lastName}
            </h1>
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
                <span className="font-medium text-stone-700">Groomer:</span>{" "}
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
            <span className="text-sm text-stone-500">Groomer</span>
            <select
              name="preferredStaffId"
              aria-label="Preferred groomer"
              defaultValue={customer.preferredStaffId ?? ""}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
            className="bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Appointment
          </Link>
        </div>
      </div>

      {searchParams.rate === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Pricing saved. It applies from the next booking — visits already quoted keep their price.
        </div>
      )}
      {searchParams.redeemed === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Reward redeemed.
        </div>
      )}
      {searchParams.error === "redeem_failed" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-800 text-sm font-medium">
          Nothing to redeem — the card may have been used on another screen.
        </div>
      )}

      {/* What this customer pays, and what they have earned */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="bg-white border border-stone-200 rounded-2xl p-4">
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
                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
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
          <div className="bg-white border border-stone-200 rounded-2xl p-4">
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
                    className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
      </div>

      {searchParams.alt === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-green-800 text-sm font-medium">
          Approved alternate saved.
        </div>
      )}
      {searchParams.error === "alt_email" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-800 text-sm font-medium">
          That alternate email address does not look valid.
        </div>
      )}

      {/* Where they are — for pickups, drop-offs and checking the service area */}
      <details className="bg-white border border-stone-200 rounded-xl" open={!customer.address}>
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800 flex items-center justify-between gap-3">
          <span>Address</span>
          <span className="text-xs font-normal text-stone-500 truncate">
            {customer.address ?? "No address on file"}
          </span>
        </summary>
        <div className="px-3 pb-3 pt-1 border-t border-stone-100 grid gap-3 md:grid-cols-2">
          <form action={setCustomerAddress} className="flex flex-col gap-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">Street address</span>
              <textarea
                name="address"
                rows={3}
                defaultValue={customer.address ?? ""}
                placeholder="123 Main St, Phoenix, AZ 85020"
                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </label>
            <button
              type="submit"
              className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold self-start"
            >
              Save address
            </button>
          </form>

          {customer.address && (
            <AddressMap
              address={customer.address}
              title={`Map showing ${customer.firstName} ${customer.lastName}'s address`}
              height={170}
              compact
            />
          )}
        </div>
      </details>

      {/* Who else may hand over or collect the pet */}
      <details className="bg-white border border-stone-200 rounded-xl" open={!customer.altContactName}>
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800 flex items-center justify-between gap-3">
          <span>Approved alternate</span>
          <span className="text-xs font-normal text-stone-500 truncate">
            {customer.altContactName
              ? `${customer.altContactName}${customer.altContactPhone ? ` · ${customer.altContactPhone}` : ""}`
              : "Nobody else approved"}
          </span>
        </summary>
        <form
          action={setAlternateContact}
          className="px-3 pb-3 pt-1 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
        >
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="text-sm">
            <span className="block text-stone-500 mb-1">Name</span>
            <input
              name="altContactName"
              defaultValue={customer.altContactName ?? ""}
              className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <label className="text-sm">
            <span className="block text-stone-500 mb-1">Phone</span>
            <input
              name="altContactPhone"
              defaultValue={customer.altContactPhone ?? ""}
              className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <label className="text-sm">
            <span className="block text-stone-500 mb-1">Email</span>
            <input
              name="altContactEmail"
              type="email"
              defaultValue={customer.altContactEmail ?? ""}
              className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
          >
            Save
          </button>
        </form>
      </details>

      {insights.length > 0 && (
        <section>
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-1.5">
            What their history shows
          </h2>
          <InsightList insights={insights} compact />
        </section>
      )}

      {/* Pets section */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">
          Pets{" "}
          <span className="text-stone-400 font-normal text-base">({customer.pets.length})</span>
        </h2>
        {customer.pets.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
            No active pets on file.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customer.pets.map((pet) => (
              <Link
                key={pet.id}
                href={`/staff/pets/${pet.id}`}
                className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                      {pet.name}
                    </p>
                    <p className="text-sm text-stone-500 mt-0.5">
                      {formatSpecies(pet.species)}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                    </p>
                  </div>
                  {pet.hasBiteHistory && (
                    <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      ⚠ Bite
                    </span>
                  )}
                </div>
                {pet.weightLbs && (
                  <p className="text-xs text-stone-400 mt-2">{pet.weightLbs} lbs</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent appointments */}
      <section>
        <h2 className="text-lg font-bold text-stone-800 mb-3">Recent Appointments</h2>
        {customer.appointments.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
            No appointments yet.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-widest">
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
                    <tr key={appt.id} className="hover:bg-stone-50 transition-colors">
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
      </section>
    </div>
  );
}
