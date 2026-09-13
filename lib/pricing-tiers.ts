import { type PricingTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Rates the shop honours below its published prices.
 *
 * A grooming shop that has been open for years carries customers on a price
 * agreed long ago. Writing that in a note leaves every quote wrong and every
 * new groomer guessing; naming the rate once and pointing customers at it
 * keeps the arithmetic in one place and makes "what do we charge the legacy
 * lot?" a question with an answer.
 *
 * The discount applies to the visit total, not to individual lines, because
 * that is how the shop talks about it — "fifteen percent off" or "ten dollars
 * off", never per-service. `Appointment.pricingDiscountCents` snapshots the
 * result so editing a tier never reprices a visit already quoted.
 *
 * The rate arithmetic itself lives in lib/pricing-tiers-math.ts (no Prisma
 * import, so it's safe for a client component) and is re-exported below so
 * every existing server-side import of this module keeps working unchanged.
 */
export {
  EXAMPLE_LIST_CENTS,
  describeRate,
  listTotalCents,
  quoteFor,
  tierDiscountCents,
  type Quote,
  type TierRate,
} from "@/lib/pricing-tiers-math";
import { listTotalCents, tierDiscountCents, type TierRate } from "@/lib/pricing-tiers-math";

/** Tiers for the admin list and the assignment dropdowns, in display order. */
export async function listPricingTiers(includeInactive = true): Promise<PricingTier[]> {
  return prisma.pricingTier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** The rate a customer is on right now, or null for list prices. */
async function tierForCustomer(customerId: string): Promise<TierRate | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { pricingTier: true },
  });
  return customer?.pricingTier ?? null;
}

/** How many customers sit on each tier, for the admin list. */
export async function tierCustomerCounts(): Promise<Map<string, number>> {
  const rows = await prisma.customer.groupBy({
    by: ["pricingTierId"],
    where: { pricingTierId: { not: null }, isActive: true },
    _count: { _all: true },
  });
  return new Map(
    rows
      .filter((row): row is typeof row & { pricingTierId: string } => row.pricingTierId != null)
      .map((row) => [row.pricingTierId, row._count._all])
  );
}

/**
 * The two columns a new visit carries: which rate it was quoted under, and
 * what that took off. Snapshotted at booking so a later edit to the tier — or
 * moving the customer onto a different one — leaves quoted visits alone.
 *
 * Returns nulls when the customer is on list prices, which is the common case.
 */
export async function bookingRateSnapshot(
  customerId: string,
  lines: { priceCents: number | null }[]
): Promise<{ pricingTierId: string | null; pricingDiscountCents: number | null }> {
  const tier = await tierForCustomer(customerId);
  if (!tier || !tier.isActive) return { pricingTierId: null, pricingDiscountCents: null };

  const discountCents = tierDiscountCents(listTotalCents(lines), tier);
  return {
    pricingTierId: tier.id,
    pricingDiscountCents: discountCents > 0 ? discountCents : null,
  };
}
