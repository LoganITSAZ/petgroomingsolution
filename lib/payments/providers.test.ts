import { describe, expect, it } from "vitest";
import { PaymentProvider } from "@prisma/client";
import { PAYMENT_PROVIDERS, adapterFor, activeProvider } from "./index";

describe("the provider registry", () => {
  it("declares every provider in the enum", () => {
    expect(Object.keys(PAYMENT_PROVIDERS).sort()).toEqual(Object.values(PaymentProvider).sort());
  });

  it("says what Clover needs rather than offering a dead switch", () => {
    const needs = adapterFor(PaymentProvider.CLOVER).needs();
    expect(needs).toMatch(/Clover app/i);
  });

  it("is not live when no provider is chosen", () => {
    expect(activeProvider(null)).toBeNull();
  });

  it("is not live when the chosen provider is missing its configuration", () => {
    expect(activeProvider(PaymentProvider.CLOVER)).toBeNull();
  });
});
