import { DiscountKind, type PricingTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";

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
 */

export type TierRate = Pick<
  PricingTier,
  "id" | "name" | "discountKind" | "discountPercent" | "discountCents" | "note" | "isActive"
>;

export interface Quote {
  /** Sum of the catalog prices, before any rate is applied. */
  listCents: number;
  /** What the tier takes off. Zero when there is no tier. */
  discountCents: number;
  /** What the customer is quoted. Never below zero. */
  quotedCents: number;
  tier: TierRate | null;
}

/**
 * What a tier takes off a total. An inactive tier takes nothing off, so
 * switching a tier off restores list prices everywhere without unassigning
 * anybody.
 */
export function tierDiscountCents(listCents: number, tier: TierRate | null): number {
  if (!tier || !tier.isActive || listCents <= 0) return 0;

  if (tier.discountKind === DiscountKind.PERCENT) {
    const percent = tier.discountPercent ?? 0;
    if (percent <= 0) return 0;
    // A tier can be generous but never negative, and never more than the visit.
    return Math.min(listCents, Math.round((listCents * Math.min(percent, 100)) / 100));
  }

  const cents = tier.discountCents ?? 0;
  return cents <= 0 ? 0 : Math.min(listCents, cents);
}

/** The full quote for a visit: list price, what comes off, what is charged. */
export function quoteFor(listCents: number, tier: TierRate | null): Quote {
  const discountCents = tierDiscountCents(listCents, tier);
  return {
    listCents,
    discountCents,
    quotedCents: Math.max(0, listCents - discountCents),
    tier: tier ?? null,
  };
}

/** Sum of the priced lines on a visit. Unpriced lines contribute nothing. */
export function listTotalCents(lines: { priceCents: number | null }[]): number {
  return lines.reduce((sum, line) => sum + (line.priceCents ?? 0), 0);
}

/** "15% off" / "$10 off" — the rate in the shop's own words. */
export function describeRate(tier: TierRate): string {
  if (tier.discountKind === DiscountKind.PERCENT) {
    const percent = tier.discountPercent ?? 0;
    return percent > 0 ? `${trimNumber(percent)}% off` : "No discount";
  }
  const cents = tier.discountCents ?? 0;
  return cents > 0 ? `${formatCents(cents)} off` : "No discount";
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Tiers for the admin list and the assignment dropdowns, in display order. */
export async function listPricingTiers(includeInactive = true): Promise<PricingTier[]> {
  return prisma.pricingTier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** The rate a customer is on right now, or null for list prices. */
export async function tierForCustomer(customerId: string): Promise<TierRate | null> {
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
