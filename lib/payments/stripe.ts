import { PaymentProvider } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";

export const stripeAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.STRIPE,
  label: "Stripe Terminal",
  needs: () => (process.env.STRIPE_SECRET_KEY ? null : "STRIPE_SECRET_KEY is not set"),
  startCharge: async () => {
    throw new Error("not yet implemented");
  },
  pollCharge: async () => {
    throw new Error("not yet implemented");
  },
  cancelCharge: async () => {
    throw new Error("not yet implemented");
  },
  listReaders: async () => {
    throw new Error("not yet implemented");
  },
};
