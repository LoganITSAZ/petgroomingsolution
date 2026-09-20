import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { formatShopDate } from "@/lib/utils";

/**
 * The missed-appointment fee, and who to say it to.
 *
 * The shop asked for deposits. Deposits mean a card on file, which means a
 * vault and PCI scope this app does not carry -- so the fee is charged at the
 * counter on the next visit instead, out of the `Surcharge` catalog that has
 * always been there. It collects late, from exactly the people who come back.
 *
 * Nothing here is a new table or a new flag. The fee is one published
 * surcharge row; a shop that does not charge one deletes it and the notice
 * stops naming an amount.
 */

/** The published fee this reads, matched by label. Seeded; the shop may retire it. */
export const MISSED_APPOINTMENT_LABEL = "Missed appointment";

/**
 * How far back a miss still counts. Not a setting: a shop with an opinion
 * about the number is really asking to charge more, which is the fee's own
 * amount, and this is the same reasoning as `EXPIRING_SOON_DAYS`.
 */
export const NO_SHOW_LOOKBACK_DAYS = 180;

export interface MissedVisits {
  count: number;
  lastMissedAt: Date;
  /** The published fee, or null once the shop retires the surcharge. */
  feeCents: number | null;
}

/**
 * The line to show. Two audiences, because they are being told two different
 * things: an owner is being asked to ring ahead, and the counter is being told
 * what it may add to this ticket.
 *
 * An amount is only ever quoted when one is published. A shop that deleted the
 * fee must not have the app threaten a number it will not charge -- but the
 * miss itself is still worth naming, so the notice stays and drops the price.
 */
export function missedVisitMessage(missed: MissedVisits, forOwner: boolean): string {
  const when = formatShopDate(missed.lastMissedAt);
  const visits =
    missed.count === 1 ? "an appointment" : `${missed.count} appointments`;
  const fee = missed.feeCents == null ? null : formatCents(missed.feeCents);

  if (forOwner) {
    return fee == null
      ? `You missed ${visits} recently — the last on ${when}. Please call us if you cannot make this one.`
      : `You missed ${visits} recently — the last on ${when}. A ${fee} missed-appointment fee may be added to your next visit, so please call us if you cannot make this one.`;
  }
  return fee == null
    ? `This household missed ${visits} recently — the last on ${when}. Worth confirming the day before.`
    : `This household missed ${visits} recently — the last on ${when}. The published missed-appointment fee is ${fee}; the counter adds it on the next visit.`;
}

/**
 * Misses inside the lookback, with the published fee. Null when there are
 * none, so a caller renders nothing without asking a second question.
 */
export async function recentMissedVisits(
  customerId: string,
  now: Date = new Date()
): Promise<MissedVisits | null> {
  const since = new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 86_400_000);

  const [missed, fee] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        customerId,
        status: AppointmentStatus.NO_SHOW,
        scheduledAt: { gte: since, lte: now },
      },
      select: { scheduledAt: true },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.surcharge.findFirst({
      where: { label: MISSED_APPOINTMENT_LABEL, isActive: true },
      select: { minCents: true },
    }),
  ]);

  if (missed.length === 0) return null;
  return {
    count: missed.length,
    lastMissedAt: missed[0].scheduledAt,
    feeCents: fee?.minCents ?? null,
  };
}
