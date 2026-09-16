import type { PaymentProvider } from "@prisma/client";

/**
 * What a processor has to be able to do, and nothing more.
 *
 * Five methods, because that is what pushing a charge to a reader needs. The
 * seam exists so the attempt row and the Payment row never learn whose JSON
 * they came from -- see the spec for which processors fit behind it and which
 * cannot be reached from a server at all.
 */

export interface ChargeRequest {
  readerRef: string;
  /** What the visit owes, before any tip the reader collects. */
  amountCents: number;
  /** What a percentage tip is calculated on -- the groom, not the surcharge. */
  tipEligibleCents: number;
  /** Shown on the reader: the pet and the shop. */
  description: string;
  /** Reused on every retry of one attempt. */
  idempotencyKey: string;
  /**
   * An existing charge to drive again rather than create.
   *
   * A declined card leaves the intent alive and payable, and Stripe's
   * double-charge guidance is to reuse it rather than open a second one.
   */
  existingRef?: string;
}

export type ChargeOutcome =
  | { status: "PENDING" }
  | { status: "SUCCEEDED"; amountCents: number; tipCents: number; reference: string }
  | {
      status: "FAILED" | "CANCELED";
      code: string;
      message: string;
      /** True only for a card error. Anything else is staff-facing. */
      customerSafe: boolean;
    };

export interface ReaderInfo {
  id: string;
  label: string;
  /** The provider's own word: "online", "offline". Shown, not parsed. */
  status: string;
  livemode: boolean;
}

export interface PaymentProviderAdapter {
  key: PaymentProvider;
  label: string;
  /**
   * What is missing, or null when live. The same shape as `needs` in
   * lib/features.ts: say why rather than showing a switch that does nothing.
   */
  needs(): string | null;
  startCharge(request: ChargeRequest): Promise<{ providerRef: string }>;
  pollCharge(providerRef: string): Promise<ChargeOutcome>;
  cancelCharge(readerRef: string, providerRef: string): Promise<void>;
  listReaders(): Promise<ReaderInfo[]>;
}
