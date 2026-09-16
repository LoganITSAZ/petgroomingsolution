import { PaymentAttemptStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adapterFor } from "./index";
import type { ChargeOutcome } from "./types";

/**
 * The only place a provider outcome becomes a Payment row.
 *
 * The page poll and the sweep job both land here, which is the point: a
 * charge that succeeded while the counter's tab was closed is settled by the
 * job through the same code that would have settled it on screen. Idempotent
 * on two unique columns -- `PaymentAttempt.paymentId` and
 * `PaymentAttempt.providerRef` -- so settling twice writes one Payment.
 */

export function attemptStatusFor(outcome: ChargeOutcome): PaymentAttemptStatus {
  return PaymentAttemptStatus[outcome.status];
}

export interface PaymentData {
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  reference: string;
}

/** Null unless money moved. A decline is a fact about the attempt, not a Payment. */
export function paymentFromOutcome(outcome: ChargeOutcome): PaymentData | null {
  if (outcome.status !== "SUCCEEDED") return null;
  return {
    method: PaymentMethod.CARD,
    amountCents: outcome.amountCents,
    tipCents: outcome.tipCents,
    reference: outcome.reference,
  };
}

export async function settleAttempt(attemptId: string): Promise<PaymentAttemptStatus> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error(`No payment attempt ${attemptId}`);
  // Already finished. Nothing to ask the provider and nothing to write.
  if (attempt.status !== PaymentAttemptStatus.PENDING) return attempt.status;

  const outcome = await adapterFor(attempt.provider).pollCharge(attempt.providerRef);
  const status = attemptStatusFor(outcome);
  if (status === PaymentAttemptStatus.PENDING) return status;

  const payment = paymentFromOutcome(outcome);
  const failure = outcome.status === "FAILED" || outcome.status === "CANCELED" ? outcome : null;

  await prisma.$transaction(async (tx) => {
    /*
     * The guard is the `status: PENDING` in the where clause: two settles
     * racing (the page poll and the sweep job on the same second) means the
     * second updates nothing, so only one Payment is ever created.
     */
    const claimed = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
      data: {
        status,
        settledAt: new Date(),
        failureCode: failure?.code ?? null,
        failureMessage: failure?.message ?? null,
      },
    });
    if (claimed.count === 0 || !payment) return;

    const created = await tx.payment.create({
      data: {
        appointmentId: attempt.appointmentId,
        provider: attempt.provider,
        takenById: attempt.startedById,
        ...payment,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { paymentId: created.id },
    });
  });

  return status;
}
