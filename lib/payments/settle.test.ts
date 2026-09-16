import { describe, expect, it } from "vitest";
import { PaymentAttemptStatus } from "@prisma/client";
import { attemptStatusFor, paymentFromOutcome } from "./settle";

describe("attemptStatusFor", () => {
  it("maps each outcome onto the column it is stored in", () => {
    expect(attemptStatusFor({ status: "PENDING" })).toBe(PaymentAttemptStatus.PENDING);
    expect(
      attemptStatusFor({ status: "SUCCEEDED", amountCents: 100, tipCents: 0, reference: "Card" })
    ).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(
      attemptStatusFor({ status: "FAILED", code: "c", message: "m", customerSafe: true })
    ).toBe(PaymentAttemptStatus.FAILED);
    expect(
      attemptStatusFor({ status: "CANCELED", code: "c", message: "m", customerSafe: true })
    ).toBe(PaymentAttemptStatus.CANCELED);
  });
});

describe("paymentFromOutcome", () => {
  it("writes a Payment only for money that actually moved", () => {
    expect(paymentFromOutcome({ status: "PENDING" })).toBeNull();
    expect(
      paymentFromOutcome({ status: "FAILED", code: "c", message: "m", customerSafe: true })
    ).toBeNull();
    expect(
      paymentFromOutcome({ status: "CANCELED", code: "c", message: "m", customerSafe: true })
    ).toBeNull();
  });

  it("carries the total and the tip across unchanged", () => {
    expect(
      paymentFromOutcome({
        status: "SUCCEEDED",
        amountCents: 9_000,
        tipCents: 1_000,
        reference: "Visa ••4242",
      })
    ).toEqual({
      method: "CARD",
      amountCents: 9_000,
      tipCents: 1_000,
      reference: "Visa ••4242",
    });
  });
});
