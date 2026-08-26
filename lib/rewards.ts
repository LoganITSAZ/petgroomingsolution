import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";

/**
 * The visit punch card.
 *
 * A finished visit is a punch. Every `rewardVisitsPerReward` punches earns one
 * `rewardLabel`, which staff hand over at the counter. Nothing here is a
 * balance column: punches are `RewardEarning` rows and what is available is
 * derived against `RewardRedemption`, so a visit cancelled after it was marked
 * complete takes its punch with it instead of leaving a counter one too high.
 *
 * Deliberately counted in visits, not money. The app stores list prices, not
 * tickets — see the pricing notes in CLAUDE.md — so a spend-based scheme would
 * be built on estimates, and a customer can count their own visits.
 */

/** The statuses that mean the pet was actually done. Matches lib/analytics.ts. */
const FINISHED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETE,
  AppointmentStatus.READY_PICKUP,
  AppointmentStatus.PICKED_UP,
];

/** A visit that is done with: its bill is no longer open to a discount. */
const SETTLED: AppointmentStatus[] = [
  AppointmentStatus.PICKED_UP,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

/** A visit that ended this way was never served, so it never earned a punch. */
const UNEARNS: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

export interface RewardCard {
  enabled: boolean;
  /** Finished visits on record, all time. */
  punches: number;
  /** Punches needed for one reward. */
  perReward: number;
  /** Rewards the punches have earned, all time. */
  earned: number;
  /** Rewards already handed over. */
  redeemed: number;
  /** Earned but not yet handed over. */
  available: number;
  /** Punches towards the next reward, 0…perReward-1 (or perReward when one is waiting). */
  progress: number;
  /** Visits still to go before the next reward. */
  toNext: number;
  /** What the customer gets, in the shop's words. */
  label: string;
  /** What one reward takes off a bill, in cents. */
  valueCents: number;
  /** What every reward waiting is worth together, in cents. */
  availableValueCents: number;
}

const OFF: RewardCard = {
  enabled: false,
  punches: 0,
  perReward: 0,
  earned: 0,
  redeemed: 0,
  available: 0,
  progress: 0,
  toNext: 0,
  label: "",
  valueCents: 0,
  availableValueCents: 0,
};

function buildCard(
  punches: number,
  redeemed: number,
  perReward: number,
  label: string,
  valueCents: number
): RewardCard {
  // A mis-saved setting must not divide by zero or hand out a reward a visit.
  const per = Math.max(1, Math.floor(perReward));
  const value = Math.max(0, Math.round(valueCents));
  const earned = Math.floor(punches / per);
  const available = Math.max(0, earned - redeemed);

  return {
    enabled: true,
    punches,
    perReward: per,
    earned,
    redeemed,
    available,
    // With a reward waiting the card reads as full rather than resetting to 0.
    progress: available > 0 ? per : punches % per,
    toNext: available > 0 ? 0 : per - (punches % per),
    label,
    valueCents: value,
    availableValueCents: available * value,
  };
}

/**
 * What a reward takes off a bill.
 *
 * A punch card is counted in visits, but it is paid out in money — a visit
 * carries several services and "a free nail trim" does not divide across
 * them. The discount is a cash amount, and it can never exceed the bill: a
 * reward is money off, not money back, so an $8 visit against a $10 reward
 * settles at zero rather than owing the customer $2.
 *
 * Applied to what is left after any negotiated rate, because the rate is the
 * price the customer was quoted and the reward comes off that price.
 */
export function rewardDiscountFor(
  billCents: number,
  valueCents: number,
  rewards = 1
): number {
  const value = Math.max(0, Math.round(valueCents));
  const count = Math.max(0, Math.floor(rewards));
  return Math.min(Math.max(0, billCents), value * count);
}

/** One customer's card. Returns a disabled card when the feature is off. */
export async function rewardCard(customerId: string): Promise<RewardCard> {
  const config = await getConfig();
  if (!config.featureRewards) return OFF;

  const [punches, redeemed] = await Promise.all([
    prisma.rewardEarning.count({ where: { customerId } }),
    prisma.rewardRedemption.count({ where: { customerId } }),
  ]);

  return buildCard(
    punches,
    redeemed,
    config.rewardVisitsPerReward,
    config.rewardLabel,
    config.rewardValueCents
  );
}

/**
 * Cards for a list of customers in two queries rather than two per customer —
 * the staff customer list and the day's schedule both want the badge.
 */
export async function rewardCards(customerIds: string[]): Promise<Map<string, RewardCard>> {
  const cards = new Map<string, RewardCard>();
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  if (ids.length === 0) return cards;

  const config = await getConfig();
  if (!config.featureRewards) {
    for (const id of ids) cards.set(id, OFF);
    return cards;
  }

  const [earnings, redemptions] = await Promise.all([
    prisma.rewardEarning.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.rewardRedemption.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const punchCount = new Map(earnings.map((row) => [row.customerId, row._count._all]));
  const redeemedCount = new Map(redemptions.map((row) => [row.customerId, row._count._all]));

  for (const id of ids) {
    cards.set(
      id,
      buildCard(
        punchCount.get(id) ?? 0,
        redeemedCount.get(id) ?? 0,
        config.rewardVisitsPerReward,
        config.rewardLabel,
        config.rewardValueCents
      )
    );
  }
  return cards;
}

/**
 * Keep a visit's punch in step with its status. Called from
 * `changeAppointmentStatus()`, so every route that finishes a visit earns the
 * punch and every route that cancels one takes it back.
 *
 * Idempotent in both directions: `RewardEarning.appointmentId` is unique, and
 * a visit walks through three finished statuses in a row.
 */
export async function syncRewardForVisit(
  appointmentId: string,
  customerId: string,
  status: AppointmentStatus
): Promise<void> {
  // Punches accrue even while the feature is switched off, so turning it on
  // does not start every regular back at zero. Only the display is gated.
  if (FINISHED_STATUSES.includes(status)) {
    await prisma.rewardEarning.createMany({
      data: [{ appointmentId, customerId }],
      skipDuplicates: true,
    });
    return;
  }

  if (UNEARNS.includes(status)) {
    await prisma.rewardEarning.deleteMany({ where: { appointmentId } });
  }
}

/**
 * Hand a reward over. Re-checks the balance inside the write, because the
 * counter and the customer's page can both be open on the same account.
 */
export async function redeemReward({
  customerId,
  staffId,
  note,
  appointmentId,
}: {
  customerId: string;
  staffId?: string | null;
  note?: string | null;
  /** Take it off this visit's bill. Omitted, it is handed over at the counter. */
  appointmentId?: string | null;
}): Promise<{ ok: true; discountCents: number } | { ok: false; reason: string }> {
  const config = await getConfig();
  if (!config.featureRewards) return { ok: false, reason: "Rewards are switched off." };

  const card = await rewardCard(customerId);
  if (card.available < 1) return { ok: false, reason: "This customer has no reward to redeem." };

  // Applying it to a visit is the whole point of a cash reward, so the visit
  // has to be this customer's and it has to still be open — repricing a
  // visit the customer has already collected and paid for is not a discount,
  // it is an edit to history.
  let discountCents = 0;
  let visitId: string | undefined;

  if (appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        customerId: true,
        status: true,
        pricingDiscountCents: true,
        rewardDiscountCents: true,
        services: { select: { priceCents: true } },
      },
    });

    if (!appointment || appointment.customerId !== customerId) {
      return { ok: false, reason: "That visit does not belong to this customer." };
    }
    if (SETTLED.includes(appointment.status)) {
      return { ok: false, reason: "That visit is already closed." };
    }

    const listCents = appointment.services.reduce((sum, line) => sum + (line.priceCents ?? 0), 0);
    const afterRate = Math.max(
      0,
      listCents - (appointment.pricingDiscountCents ?? 0) - appointment.rewardDiscountCents
    );
    discountCents = rewardDiscountFor(afterRate, config.rewardValueCents);

    if (discountCents === 0) {
      return { ok: false, reason: "There is nothing left on that bill to discount." };
    }
    visitId = appointment.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.rewardRedemption.create({
      data: {
        customerId,
        staffId: staffId ?? undefined,
        label: config.rewardLabel,
        valueCents: discountCents,
        appointmentId: visitId,
        note: note?.trim() || undefined,
      },
    });

    if (visitId) {
      await tx.appointment.update({
        where: { id: visitId },
        data: { rewardDiscountCents: { increment: discountCents } },
      });
    }
  });

  return { ok: true, discountCents };
}

/** The card's history, newest first, for the customer's page. */
export async function rewardHistory(customerId: string, take = 10) {
  return prisma.rewardRedemption.findMany({
    where: { customerId },
    orderBy: { redeemedAt: "desc" },
    take,
    include: { staff: { select: { name: true } } },
  });
}
