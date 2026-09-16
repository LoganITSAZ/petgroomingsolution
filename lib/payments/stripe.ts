import { PaymentProvider } from "@prisma/client";
import Stripe from "stripe";
import type { ChargeOutcome, ChargeRequest, PaymentProviderAdapter, ReaderInfo } from "./types";

/**
 * Stripe Terminal, server-driven.
 *
 * The app never sees a card: the reader talks to Stripe, and what comes back
 * is an amount, a tip and four digits. `outcomeFromIntent` is the only part
 * that can be wrong in a way money notices, so it is pure and tested; the
 * calls around it are three lines each.
 */

// Pinned deliberately: stripe-node otherwise floats to whatever was current
// when the package was published, and npm update would move the money path.
const API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

/**
 * Built per call, never at module scope -- `next build` evaluates route
 * modules and the key is absent in CI. Same shape as lib/email.ts.
 */
function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: API_VERSION });
}

/** Only what we read. The real object has several hundred fields. */
export interface IntentShape {
  status: string;
  amount: number;
  amount_details?: { tip?: { amount?: number | null } | null } | null;
  latest_charge?: {
    payment_method_details?: {
      card_present?: { brand?: string | null; last4?: string | null } | null;
    } | null;
  } | null;
  last_payment_error?: { type?: string; code?: string; message?: string } | null;
}

function reference(intent: IntentShape): string {
  const card = intent.latest_charge?.payment_method_details?.card_present;
  if (!card?.last4) return "Card";
  const brand = card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} ••${card.last4}`;
}

/**
 * A PaymentIntent's status, as something the counter can act on.
 *
 * `requires_payment_method` is two different situations wearing one word: a
 * fresh intent nobody has tapped yet, and one whose card was declined. The
 * error is what tells them apart, which is why a missing error reads as
 * pending rather than as a failure.
 */
export function outcomeFromIntent(intent: IntentShape): ChargeOutcome {
  if (intent.status === "succeeded") {
    return {
      status: "SUCCEEDED",
      // `amount` is tip-inclusive after confirmation, which is exactly what
      // Payment.amountCents has always meant.
      amountCents: intent.amount,
      tipCents: intent.amount_details?.tip?.amount ?? 0,
      reference: reference(intent),
    };
  }

  if (intent.status === "canceled") {
    return {
      status: "CANCELED",
      code: "canceled",
      message: "The payment was cancelled.",
      customerSafe: true,
    };
  }

  const error = intent.last_payment_error;
  if (intent.status === "requires_payment_method" && error) {
    return {
      status: "FAILED",
      code: error.code ?? "payment_failed",
      message: error.message ?? "The payment failed.",
      // Stripe's own rule: a card error is for the cardholder, anything else
      // is ours.
      customerSafe: error.type === "card_error",
    };
  }

  return { status: "PENDING" };
}

export const stripeAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.STRIPE,
  label: "Stripe Terminal",

  needs: () =>
    process.env.STRIPE_SECRET_KEY
      ? null
      : "STRIPE_SECRET_KEY is not set on the server — see DEPLOY.md",

  async startCharge(request: ChargeRequest) {
    const stripe = client();

    // The idempotency key belongs to the attempt, so a retry after a timeout
    // returns the first intent rather than creating a second one.
    const intent = request.existingRef
      ? await stripe.paymentIntents.retrieve(request.existingRef)
      : await stripe.paymentIntents.create(
          {
            amount: request.amountCents,
            currency: "usd",
            payment_method_types: ["card_present"],
            capture_method: "automatic",
            description: request.description,
          },
          { idempotencyKey: request.idempotencyKey }
        );

    await stripe.terminal.readers.processPaymentIntent(
      request.readerRef,
      {
        payment_intent: intent.id,
        process_config: {
          enable_customer_cancellation: true,
          // A percentage tip is on the groom, not on a matting surcharge.
          tipping: { amount_eligible: request.tipEligibleCents },
        },
      },
      { idempotencyKey: `${request.idempotencyKey}-process` }
    );

    return { providerRef: intent.id };
  },

  async pollCharge(providerRef: string) {
    const intent = await client().paymentIntents.retrieve(providerRef, {
      expand: ["latest_charge"],
    });
    return outcomeFromIntent(intent as unknown as IntentShape);
  },

  async cancelCharge(readerRef: string, providerRef: string) {
    const stripe = client();
    // Reset the reader first; cancelling the intent while the reader still
    // holds it leaves the screen up in the lobby.
    await stripe.terminal.readers.cancelAction(readerRef);
    await stripe.paymentIntents.cancel(providerRef);
  },

  async listReaders(): Promise<ReaderInfo[]> {
    const readers = await client().terminal.readers.list({ limit: 100 });
    return readers.data.map((reader) => ({
      id: reader.id,
      label: reader.label ?? reader.id,
      status: reader.status ?? "unknown",
      livemode: reader.livemode,
    }));
  },
};
