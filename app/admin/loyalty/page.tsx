import Link from "next/link";
import {
  describeRate,
  EXAMPLE_LIST_CENTS,
  listPricingTiers,
      quoteFor,
      tierCustomerCounts,
} from "@/lib/pricing-tiers";
import { formatCents } from "@/lib/pricing";
import { deletePricingTier, savePricingTier } from "./actions";
import TierFields from "./TierFields";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Loyalty Tiers" };

/**
 * The rates the shop honours below its published prices.
 *
 * Every shop that has been open a while carries customers on an old price.
 * Naming the rate here rather than writing it in a note means a quote is right
 * without anyone remembering, and moving the whole group is one edit.
 */

const ERRORS: Record<string, string> = {
  name_required: "A rate needs a name.",
  duplicate: "There is already a rate with that name.",
  bad_percent: "Percent off must be between 0 and 100.",
  bad_amount: "Amount off must be more than zero.",
  not_found: "That rate no longer exists.",
};

interface PageProps {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}

export default async function LoyaltyTiersPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const [tiers, counts] = await Promise.all([listPricingTiers(), tierCustomerCounts()]);
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const assigned = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);

  return (
    <PageShell
      title="Loyalty Tiers"
      subtitle={
        <>
          Rates below the published price, for legacy customers and anyone else the shop has agreed
          a number with. {tiers.length} rate{tiers.length !== 1 ? "s" : ""}, {assigned} customer
          {assigned !== 1 ? "s" : ""} assigned. Put a customer on one from their{" "}
          <Link href="/staff/customers" className="text-amber-700 hover:underline">
            profile
          </Link>
          .
        </>
      }
    >

      {searchParams.saved && (
        <SaveToast>
          Saved {searchParams.saved}.
        </SaveToast>
      )}
      {searchParams.deleted != null && (
        <SaveToast>
          Rate removed.{" "}
          {Number(searchParams.deleted) > 0
            ? `${searchParams.deleted} customer${Number(searchParams.deleted) !== 1 ? "s are" : " is"} back on list prices. Visits already quoted keep the price they were given.`
            : "Nobody was on it."}
        </SaveToast>
      )}
      {errorMessage && (
        <SaveToast tone="error">
          {errorMessage}
        </SaveToast>
      )}

      <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        A rate comes off the visit total at the moment it is quoted, and that figure is stored on
        the visit. Editing a rate changes what is quoted from now on — it never reprices a visit
        already booked. Groomer commission still pays on the list price.
      </p>

      <details className="border-t border-stone-100">
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800">
          + Add a rate
        </summary>
        <form action={savePricingTier} className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-3">
          <TierFields idPrefix="new-tier" />
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Add Rate
            </button>
          </div>
        </form>
      </details>

      {tiers.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No special rates yet. Every customer is charged the published price.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
          {tiers.map((tier) => {
            const onTier = counts.get(tier.id) ?? 0;
            const example = quoteFor(EXAMPLE_LIST_CENTS, tier);

            return (
              <details key={tier.id}>
                <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-semibold text-stone-900">{tier.name}</span>
                    {!tier.isActive && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-500 ">
                        Off
                      </span>
                    )}
                    {tier.note && (
                      <span className="block text-xs text-stone-400 truncate">{tier.note}</span>
                    )}
                  </span>
                  <span className="text-xs text-stone-400 whitespace-nowrap">
                    {describeRate(tier)} · {onTier} customer{onTier !== 1 ? "s" : ""}
                    {tier.isActive && (
                      <span className="block">
                        {formatCents(EXAMPLE_LIST_CENTS)} visit → {formatCents(example.quotedCents)}
                      </span>
                    )}
                  </span>
                </summary>

                <div className="px-3 pb-3 border-t border-stone-100 pt-3 space-y-3">
                  <form action={savePricingTier} className="space-y-3">
                    <input type="hidden" name="id" value={tier.id} />
                    <TierFields tier={tier} idPrefix={`tier-${tier.id}`} />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </form>

                  <form action={deletePricingTier} className="flex justify-end">
                    <input type="hidden" name="id" value={tier.id} />
                    <button
                      type="submit"
                      className="text-xs text-stone-400 hover:text-red-700 underline"
                    >
                      {onTier > 0
                        ? `Remove — puts ${onTier} customer${onTier !== 1 ? "s" : ""} back on list prices`
                        : "Remove this rate"}
                    </button>
                  </form>
                </div>
              </details>
            );
          })}
        </PageSection>
      )}
    </PageShell>
  );
}
