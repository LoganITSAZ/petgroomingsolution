import { describe, expect, it } from "vitest";
import { outcomeFromIntent, type IntentShape } from "./stripe";

const succeeded = (over: Partial<IntentShape> = {}): IntentShape => ({
  status: "succeeded",
  amount: 9_000,
  amount_details: { tip: { amount: 1_000 } },
  latest_charge: {
    payment_method_details: { card_present: { brand: "visa", last4: "4242" } },
  },
  ...over,
});

describe("outcomeFromIntent", () => {
  it("takes the tip out of the total without changing the total", () => {
    // The reader collected $80 of groom and a $10 tip. `amount` is the whole
    // $90 -- which is what Payment.amountCents has always meant.
    expect(outcomeFromIntent(succeeded())).toEqual({
      status: "SUCCEEDED",
      amountCents: 9_000,
      tipCents: 1_000,
      reference: "Visa ••4242",
    });
  });

  it("reads no tip as zero, whether the reader offered one or not", () => {
    expect(
      outcomeFromIntent(succeeded({ amount_details: { tip: { amount: 0 } } }))
    ).toMatchObject({ tipCents: 0 });
    expect(outcomeFromIntent(succeeded({ amount_details: null }))).toMatchObject({ tipCents: 0 });
    expect(outcomeFromIntent(succeeded({ amount_details: { tip: null } }))).toMatchObject({
      tipCents: 0,
    });
  });

  it("still settles when the card details did not come back", () => {
    expect(outcomeFromIntent(succeeded({ latest_charge: null }))).toMatchObject({
      status: "SUCCEEDED",
      reference: "Card",
    });
  });

  it("is pending while the customer is still holding their wallet", () => {
    for (const status of ["requires_confirmation", "requires_capture", "processing"]) {
      expect(outcomeFromIntent({ status, amount: 9_000 })).toEqual({ status: "PENDING" });
    }
  });

  it("reports a decline in words the counter can read out", () => {
    expect(
      outcomeFromIntent({
        status: "requires_payment_method",
        amount: 9_000,
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Your card has insufficient funds.",
        },
      })
    ).toEqual({
      status: "FAILED",
      code: "card_declined",
      message: "Your card has insufficient funds.",
      customerSafe: true,
    });
  });

  it("keeps our own errors away from the customer", () => {
    expect(
      outcomeFromIntent({
        status: "requires_payment_method",
        amount: 9_000,
        last_payment_error: { type: "invalid_request_error", code: "x", message: "bad param" },
      })
    ).toMatchObject({ customerSafe: false });
  });

  it("treats a fresh intent with no error as pending, not failed", () => {
    // requires_payment_method is also the state before anyone taps anything.
    expect(outcomeFromIntent({ status: "requires_payment_method", amount: 9_000 })).toEqual({
      status: "PENDING",
    });
  });

  it("reports a cancellation as its own thing", () => {
    expect(outcomeFromIntent({ status: "canceled", amount: 9_000 })).toMatchObject({
      status: "CANCELED",
    });
  });
});
