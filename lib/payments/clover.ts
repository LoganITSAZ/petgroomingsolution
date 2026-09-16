import { PaymentProvider } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";

/**
 * Clover, declared and not implemented.
 *
 * REST Pay Display can push a charge to a Flex, Mini or Compact, but not
 * before somebody publishes a Clover app, obtains a Remote App ID and takes
 * the merchant through OAuth. That is not a key a shop can paste, so the
 * honest thing is to name the obstacle. `needs()` is non-null, so nothing
 * below it is reachable.
 */

const notImplemented = (): never => {
  throw new Error("Clover is declared but not implemented — see needs().");
};

export const cloverAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.CLOVER,
  label: "Clover",
  needs: () =>
    "a published Clover app, a Remote App ID and merchant OAuth — Clover cannot be configured from this screen",
  startCharge: notImplemented,
  pollCharge: notImplemented,
  cancelCharge: notImplemented,
  listReaders: notImplemented,
};
