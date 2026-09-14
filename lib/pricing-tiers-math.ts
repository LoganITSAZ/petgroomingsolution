import { DiscountKind, type PricingTier } from "@prisma/client";
import { formatCents } from "@/lib/pricing";

/**
 * The arithmetic of a pricing tier, with no database import.
 *
 * Kept apart from lib/pricing-tiers.ts (which touches Prisma) so this half is
 * safe to import from a client component — app/admin/loyalty/TierFields.tsx
 * uses it for a live discount preview, and a Prisma import in that bundle
 * would pull server-only code into the browser.
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

/** A worked example makes the arithmetic obvious at a glance. */
export const EXAMPLE_LIST_CENTS = 8500;

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
