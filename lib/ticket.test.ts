import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { abovePublishedRange, paymentsByMethod, ticketFor, type TicketInput } from "./ticket";

function input(overrides: Partial<TicketInput> = {}): TicketInput {
  return {
    services: [{ priceCents: 6_500 }],
    surcharges: [],
    tierDiscountCents: 0,
    rewardDiscountCents: 0,
    payments: [],
    ...overrides,
  };
}

describe("ticketFor", () => {
  it("adds the surcharges a groomer found to the booked lines", () => {
    const ticket = ticketFor(
      input({
        services: [{ priceCents: 6_500 }, { priceCents: 1_500 }],
        surcharges: [{ amountCents: 2_000 }, { amountCents: 1_000 }],
      })
    );
    expect(ticket.serviceCents).toBe(8_000);
    expect(ticket.surchargeCents).toBe(3_000);
    expect(ticket.dueCents).toBe(11_000);
    expect(ticket.settled).toBe(false);
  });

  it("does not let an unpriced line poison the total", () => {
    const ticket = ticketFor(input({ services: [{ priceCents: 6_500 }, { priceCents: null }] }));
    expect(ticket.serviceCents).toBe(6_500);
    expect(Number.isInteger(ticket.dueCents)).toBe(true);
  });

  it("takes both discounts off the visit total", () => {
    const ticket = ticketFor(input({ tierDiscountCents: 650, rewardDiscountCents: 1_000 }));
    expect(ticket.discountCents).toBe(1_650);
    expect(ticket.dueCents).toBe(4_850);
  });

  it("makes a groom free rather than owing the customer money", () => {
    // A reward worth more than the visit is a free groom, not a credit.
    const ticket = ticketFor(input({ rewardDiscountCents: 9_000 }));
    expect(ticket.discountCents).toBe(6_500);
    expect(ticket.dueCents).toBe(0);
    expect(ticket.settled).toBe(true);
  });

  it("ignores a negative discount rather than charging extra for it", () => {
    const ticket = ticketFor(input({ tierDiscountCents: -5_000 }));
    expect(ticket.dueCents).toBe(6_500);
  });

  it("settles when the money handed over covers the work", () => {
    const ticket = ticketFor(input({ payments: [{ amountCents: 6_500, tipCents: 0 }] }));
    expect(ticket.balanceCents).toBe(0);
    expect(ticket.settled).toBe(true);
  });

  it("does not let a tip settle a balance", () => {
    // $80 handed over, $15 of it a tip: $65 of work paid, so this is settled —
    // but the same $80 against a $75 groom is not.
    expect(
      ticketFor(input({ payments: [{ amountCents: 8_000, tipCents: 1_500 }] })).settled
    ).toBe(true);
    const bigger = ticketFor(
      input({
        services: [{ priceCents: 7_500 }],
        payments: [{ amountCents: 8_000, tipCents: 1_500 }],
      })
    );
    expect(bigger.tipCents).toBe(1_500);
    expect(bigger.balanceCents).toBe(1_000);
    expect(bigger.settled).toBe(false);
  });

  it("sums a split payment", () => {
    const ticket = ticketFor(
      input({
        payments: [
          { amountCents: 4_000, tipCents: 0 },
          { amountCents: 3_000, tipCents: 500 },
        ],
      })
    );
    expect(ticket.paidCents).toBe(7_000);
    expect(ticket.tipCents).toBe(500);
    expect(ticket.balanceCents).toBe(0);
  });

  it("reads an overpayment as settled rather than a second thing to chase", () => {
    const ticket = ticketFor(input({ payments: [{ amountCents: 7_000, tipCents: 0 }] }));
    expect(ticket.balanceCents).toBe(-500);
    expect(ticket.settled).toBe(true);
  });
});

describe("abovePublishedRange", () => {
  it("flags a fee charged over what the shop published", () => {
    expect(abovePublishedRange(5_000, { minCents: 1_000, maxCents: 3_000 })).toBe(true);
    expect(abovePublishedRange(3_000, { minCents: 1_000, maxCents: 3_000 })).toBe(false);
  });

  it("flags nothing when the shop published no ceiling", () => {
    expect(abovePublishedRange(9_000, { minCents: 1_000, maxCents: null })).toBe(false);
    expect(abovePublishedRange(9_000, null)).toBe(false);
  });
});

describe("paymentsByMethod", () => {
  it("groups the day's payments and keeps the tips inside them", () => {
    const rows = paymentsByMethod([
      { method: PaymentMethod.CARD, amountCents: 8_000, tipCents: 1_500 },
      { method: PaymentMethod.CASH, amountCents: 6_500, tipCents: 0 },
      { method: PaymentMethod.CARD, amountCents: 5_000, tipCents: 500 },
    ]);
    expect(rows).toEqual([
      { method: PaymentMethod.CARD, amountCents: 13_000, tipCents: 2_000, count: 2 },
      { method: PaymentMethod.CASH, amountCents: 6_500, tipCents: 0, count: 1 },
    ]);
  });

  it("returns nothing for a day with no payments", () => {
    expect(paymentsByMethod([])).toEqual([]);
  });
});
