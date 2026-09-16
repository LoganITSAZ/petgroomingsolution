import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * What a visit costs, and what has been paid against it.
 *
 * The shop takes money on its own Clover terminal, so nothing here moves a
 * cent: it is the arithmetic the counter reads out and the record of what
 * happened at the terminal. Every figure is an integer number of cents -- the
 * rule from lib/pricing.ts, and the reason there is no float in the middle of
 * this file.
 *
 * Pure at the top, queries at the bottom. Money in a page component is money
 * nobody can test.
 */

export interface TicketInput {
  /** The booked lines. A null price is allowed by the catalog. */
  services: { priceCents: number | null }[];
  surcharges: { amountCents: number }[];
  /** Snapshotted on the visit at booking, never recomputed. */
  tierDiscountCents: number;
  rewardDiscountCents: number;
  payments: { amountCents: number; tipCents: number }[];
}

export interface Ticket {
  serviceCents: number;
  surchargeCents: number;
  discountCents: number;
  /** What the work costs: services + surcharges − discounts. */
  dueCents: number;
  tipCents: number;
  /** Handed over, tip included — the terminal's number. */
  paidCents: number;
  /** Positive is still owed. Negative is overpaid; a tip is not change owed. */
  balanceCents: number;
  settled: boolean;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function ticketFor(input: TicketInput): Ticket {
  // A null price contributes nothing rather than poisoning the total: the
  // catalog allows an unpriced line and the counter still has to total the rest.
  const serviceCents = sum(input.services.map((line) => line.priceCents ?? 0));
  const surchargeCents = sum(input.surcharges.map((line) => line.amountCents));
  const gross = serviceCents + surchargeCents;

  // A reward worth more than the visit is a free groom, not a credit the shop
  // owes. Clamped here so no screen has to remember to.
  const discountCents = Math.min(
    gross,
    Math.max(0, input.tierDiscountCents) + Math.max(0, input.rewardDiscountCents)
  );
  const dueCents = gross - discountCents;

  const tipCents = sum(input.payments.map((payment) => payment.tipCents));
  const paidCents = sum(input.payments.map((payment) => payment.amountCents));

  // A tip is not payment for work, so tipping does not settle a balance and a
  // tip on a part-paid visit does not read as change owed.
  const balanceCents = dueCents - (paidCents - tipCents);

  return {
    serviceCents,
    surchargeCents,
    discountCents,
    dueCents,
    tipCents,
    paidCents,
    balanceCents,
    // An overpayment is settled rather than a second thing to chase.
    settled: balanceCents <= 0,
  };
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: "Card",
  CASH: "Cash",
  CHECK: "Check",
  OTHER: "Other",
};

/**
 * What a surcharge may be charged as, in the shop's own steps.
 *
 * Severity increments of $10: light matting $10, extreme $50 or more. The
 * published range is advisory -- anything above `maxCents` is charged and
 * flagged rather than refused.
 */
export const SURCHARGE_STEP_CENTS = 1_000;

/** True when an amount is outside what the shop published for that fee. */
export function abovePublishedRange(
  amountCents: number,
  surcharge: { minCents: number | null; maxCents: number | null } | null
): boolean {
  if (!surcharge?.maxCents) return false;
  return amountCents > surcharge.maxCents;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Everything one visit's ticket is made of, in one query. */
export const TICKET_SELECT = {
  pricingDiscountCents: true,
  rewardDiscountCents: true,
  services: { select: { priceCents: true } },
  appointmentSurcharges: {
    select: {
      id: true,
      label: true,
      amountCents: true,
      aboveRange: true,
      note: true,
      createdAt: true,
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  payments: {
    select: {
      id: true,
      method: true,
      amountCents: true,
      tipCents: true,
      reference: true,
      note: true,
      takenAt: true,
      takenBy: { select: { id: true, name: true } },
    },
    orderBy: { takenAt: "asc" },
  },
} as const;

interface TicketRow {
  pricingDiscountCents: number | null;
  rewardDiscountCents: number;
  services: { priceCents: number | null }[];
  appointmentSurcharges: { amountCents: number }[];
  payments: { amountCents: number; tipCents: number }[];
}

/** The sum for a visit already loaded with `TICKET_SELECT`. */
export function ticketFromRow(row: TicketRow): Ticket {
  return ticketFor({
    services: row.services,
    surcharges: row.appointmentSurcharges,
    tierDiscountCents: row.pricingDiscountCents ?? 0,
    rewardDiscountCents: row.rewardDiscountCents,
    payments: row.payments,
  });
}

/**
 * Finished visits with something still owed, oldest first.
 *
 * The operational half of the counter screen: a pet that went home without
 * paying is what this exists to surface. Unsettled is decided by the pure
 * function rather than by SQL, because the discount floor and the tip rule
 * live there.
 */
export async function unsettledVisits(limit = 50) {
  const visits = await prisma.appointment.findMany({
    where: { status: { in: ["COMPLETE", "READY_PICKUP", "PICKED_UP"] } },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      pet: { select: { name: true } },
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      ...TICKET_SELECT,
    },
    orderBy: { scheduledAt: "desc" },
    // A bounded scan: the shop chases this week, not 2019.
    take: 400,
  });

  return visits
    .map((visit) => ({ visit, ticket: ticketFromRow(visit) }))
    // A visit with nothing to pay -- an unpriced line, or a reward covering
    // the lot -- is not a debt.
    .filter((row) => !row.ticket.settled && row.ticket.dueCents > 0)
    .sort((a, b) => a.visit.scheduledAt.getTime() - b.visit.scheduledAt.getTime())
    .slice(0, limit);
}

/** Payments taken in a window, for the end of the day. */
export async function paymentsBetween(from: Date, to: Date) {
  return prisma.payment.findMany({
    where: { takenAt: { gte: from, lt: to } },
    select: {
      id: true,
      method: true,
      amountCents: true,
      tipCents: true,
      reference: true,
      takenAt: true,
      takenBy: { select: { id: true, name: true } },
      appointment: {
        select: {
          id: true,
          pet: { select: { name: true } },
          customer: { select: { firstName: true, lastName: true } },
          staff: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { takenAt: "asc" },
  });
}

/** Payments by method, and the tips inside them. */
export function paymentsByMethod(
  payments: { method: PaymentMethod; amountCents: number; tipCents: number }[]
): { method: PaymentMethod; amountCents: number; tipCents: number; count: number }[] {
  const byMethod = new Map<PaymentMethod, { amountCents: number; tipCents: number; count: number }>();
  for (const payment of payments) {
    const row = byMethod.get(payment.method) ?? { amountCents: 0, tipCents: 0, count: 0 };
    row.amountCents += payment.amountCents;
    row.tipCents += payment.tipCents;
    row.count += 1;
    byMethod.set(payment.method, row);
  }
  return Object.values(PaymentMethod)
    .filter((method) => byMethod.has(method))
    .map((method) => ({ method, ...byMethod.get(method)! }));
}
