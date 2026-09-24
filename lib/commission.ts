import type { ServiceCategory } from "@prisma/client";

/**
 * What a groomer's work is worth, in the order the shop talks about it.
 *
 * One percentage per person was the whole of it, which cannot say "60% on a
 * full groom, 35% on a nail trim" — the split most shops actually run. So a
 * rate is looked up per line of the visit, most specific first:
 *
 *   this service → its category → this person's own rate → the shop default
 *
 * Exceptions are rows, and the absence of a row is the fallback: a shop that
 * pays one rate writes none, and a person with no rate of their own reads the
 * shop's. Nothing here is a flag.
 *
 * The **hourly floor** is the other half. Commission on a quiet Tuesday can
 * land under what somebody was scheduled for, and a shop that promises an
 * hourly minimum owes the difference. The floor is read off *scheduled* hours,
 * same rule as overtime in lib/schedule.ts: it is the number the shop can still
 * do something about, and it is an estimate either way — like every commission
 * figure in this app, it is computed on **list** prices and must be labelled a
 * floor, never payroll.
 */

/** One person's rates: the exceptions, then what they fall back to. */
export interface CommissionRates {
  /** Percent by service id — the most specific rate there is. */
  byService?: Record<string, number>;
  /** Percent by service category. */
  byCategory?: Partial<Record<ServiceCategory, number>>;
  /** This person's own rate. Null falls back to the shop's. */
  staffPercent?: number | null;
  /** `SystemConfig.defaultCommissionPercent`. */
  shopPercent: number;
}

/** A finished line of a visit: what was done, and its list price. */
export interface CommissionLine {
  serviceId: string | null;
  category: ServiceCategory | null;
  priceCents: number | null;
}

/** The percent that applies to one line. */
export function rateFor(line: CommissionLine, rates: CommissionRates): number {
  const byService = line.serviceId ? rates.byService?.[line.serviceId] : undefined;
  if (byService != null) return byService;

  const byCategory = line.category ? rates.byCategory?.[line.category] : undefined;
  if (byCategory != null) return byCategory;

  return rates.staffPercent ?? rates.shopPercent;
}

/**
 * Commission on a set of finished lines.
 *
 * Rounded once per line rather than once at the end: the shop reads a rate
 * against a service, so "60% of $65" has to be the figure it can check.
 */
export function commissionCents(lines: CommissionLine[], rates: CommissionRates): number {
  return lines.reduce((sum, line) => {
    if (line.priceCents == null) return sum;
    return sum + Math.round(line.priceCents * (rateFor(line, rates) / 100));
  }, 0);
}

/**
 * What the shop owes: commission, or the hourly floor if it is higher.
 *
 * No hourly rate and no scheduled time both mean commission stands on its own —
 * emptiness rather than a switch for "does this person have a floor".
 */
export function payEstimate(input: {
  commissionCents: number;
  hourlyRateCents?: number | null;
  minutesScheduled?: number;
}): { cents: number; floorCents: number; flooredBy: number } {
  const floorCents =
    input.hourlyRateCents && input.minutesScheduled
      ? Math.round((input.hourlyRateCents * input.minutesScheduled) / 60)
      : 0;
  const flooredBy = Math.max(0, floorCents - input.commissionCents);
  return { cents: Math.max(input.commissionCents, floorCents), floorCents, flooredBy };
}

/** The blended rate the shop actually paid, for a screen that wants one number. */
export function effectiveRatePercent(lines: CommissionLine[], rates: CommissionRates): number | null {
  const total = lines.reduce((sum, line) => sum + (line.priceCents ?? 0), 0);
  if (total === 0) return null;
  return Math.round((commissionCents(lines, rates) / total) * 1000) / 10;
}
