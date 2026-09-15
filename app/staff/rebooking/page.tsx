import Link from "next/link";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { rebookingEvidence, rebookingList } from "@/lib/rebooking";
import { formatShopDate } from "@/lib/utils";
import { PageShell, PageSection, StatStrip } from "@/components/ui";

export const metadata = { title: "Rebooking" };
export const dynamic = "force-dynamic";

/**
 * The households that have not come back.
 *
 * `customerRhythm()` has known this one customer at a time since it was
 * written, and nobody at the counter opens 120 profiles to find out who has
 * drifted. Every row carries its numbers -- the `evidence` rule from
 * lib/insights.ts -- because a list that says "overdue" without saying how it
 * knows is a list nobody trusts twice.
 *
 * No actions here. Rebooking is a phone call, and the booking link is where it
 * ends.
 */
export default async function RebookingPage() {
  const config = await getConfig();
  // The page redirects itself: hiding the sidebar link is presentation.
  if (!isEnabled(config, "featureRebookingPrompts")) redirect("/staff");

  const due = await rebookingList(config);
  const lapsing = due.filter((row) => row.lapsing).length;
  const chased = due.filter((row) => row.prompted).length;

  return (
    <PageShell
      title="Rebooking"
      subtitle={`Households past their own usual gap between grooms with nothing booked, worst first. ${
        config.rebookingGraceDays > 0
          ? `${config.rebookingGraceDays} days of grace after they are due.`
          : "Listed the day they are due."
      }`}
    >
      <StatStrip
        stats={[
          { label: "Overdue", value: due.length },
          { label: "Drifting away", value: lapsing },
          { label: "Already nudged", value: chased },
        ]}
      />

      {due.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Nobody is overdue. A household needs three finished visits before the shop has a cadence
          to measure them against.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
          {due.map((row) => (
            <div key={row.customerId} className="px-3 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">
                  <Link href={`/staff/customers/${row.customerId}`} className="hover:underline">
                    {row.customer.firstName} {row.customer.lastName}
                  </Link>
                  {row.lapsing && (
                    <span className="ml-2 align-middle text-xs font-semibold border rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 border-amber-200">
                      Drifting away
                    </span>
                  )}
                  {row.prompted && (
                    <span className="ml-2 align-middle text-xs text-stone-400">nudged</span>
                  )}
                </p>
                <p className="text-xs text-stone-500">
                  {row.customer.pets.map((pet) => pet.name).join(", ") || "No pets on file"} · last in{" "}
                  {formatShopDate(row.lastVisitAt)}
                </p>
                <p className="text-xs text-stone-400">{rebookingEvidence(row)}</p>
              </div>

              <p className="text-sm text-stone-700 whitespace-nowrap">
                <span className="font-semibold">{row.daysOverdue}</span> days past
              </p>

              <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                {row.customer.phone && (
                  <a href={`tel:${row.customer.phone}`} className="text-amber-700 hover:text-amber-900 underline">
                    {row.customer.phone}
                  </a>
                )}
                <Link
                  href={`/staff/appointments/new?customerId=${row.customerId}`}
                  className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
                >
                  Book
                </Link>
              </div>
            </div>
          ))}
        </PageSection>
      )}
    </PageShell>
  );
}
