import { PaymentProvider } from "@prisma/client";
import { cloverAdapter } from "./clover";
import { stripeAdapter } from "./stripe";
import type { PaymentProviderAdapter } from "./types";

export * from "./types";

/** Every processor, declared once — the same rule as the feature registry. */
export const PAYMENT_PROVIDERS: Record<PaymentProvider, PaymentProviderAdapter> = {
  [PaymentProvider.STRIPE]: stripeAdapter,
  [PaymentProvider.CLOVER]: cloverAdapter,
};

export function adapterFor(provider: PaymentProvider): PaymentProviderAdapter {
  return PAYMENT_PROVIDERS[provider];
}

/**
 * The adapter a charge may actually go through, or null.
 *
 * Null covers both "the shop has not chosen one" and "the one it chose is
 * missing its configuration", because a caller can do nothing useful with
 * either.
 */
export function activeProvider(provider: PaymentProvider | null): PaymentProviderAdapter | null {
  if (!provider) return null;
  const adapter = adapterFor(provider);
  return adapter.needs() === null ? adapter : null;
}
