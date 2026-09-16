import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { serviceAlerts } from "@/lib/alerts";
import { sendDailyDigest } from "@/lib/email";
import { isEnabled } from "@/lib/features";
import { shopInsights } from "@/lib/insights";
import { currentShopTime, shopDayKey, shopDayRange } from "@/lib/utils";
import type { JobResult, ScheduledJob } from "./types";

/**
 * "Here is the shop this morning." The third job on the runner.
 *
 * Everything in it was already true on the dashboard, and that was the problem:
 * a screen only tells the shop something when somebody opens it, and the
 * morning a manager most needs to know that Thursday is thin and no-shows have
 * doubled is the morning they are too busy to go looking.
 *
 * It carries the same `serviceAlerts()` and `shopInsights()` the dashboard
 * does, snoozes included — an insight somebody put away yesterday must not
 * arrive by email today.
 */

export interface DigestDue {
  /** Shop day key the digest last went out for, if ever. */
  lastSentOn: string | null;
  /** Shop-local hour now, 0–23. */
  hourNow: number;
  /** Shop-local hour the brief is due. */
  digestHour: number;
  /** Today's shop day key. */
  today: string;
}

/**
 * Is the brief owed?
 *
 * Pure, because the three ways this goes wrong are all about time: sending
 * twice in a day, sending at four in the morning, and never sending at all
 * because the runner was down at exactly the right minute. Late is deliberately
 * fine — a brief read at ten is worth more than no brief.
 */
export function digestDue({ lastSentOn, hourNow, digestHour, today }: DigestDue): boolean {
  if (lastSentOn === today) return false;
  return hourNow >= Math.min(23, Math.max(0, Math.floor(digestHour)));
}

export async function sendMorningDigest(now: Date): Promise<JobResult> {
  const config = await getConfig();
  if (!isEnabled(config, "featureDailyDigest")) {
    return { status: "skipped", reason: "the morning brief is switched off" };
  }

  const today = shopDayKey(now);
  const hourNow = Number(currentShopTime(now).split(":")[0]);
  if (!digestDue({ lastSentOn: config.digestLastSentOn, hourNow, digestHour: config.digestHour, today })) {
    return {
      status: "skipped",
      reason:
        config.digestLastSentOn === today
          ? "already sent today"
          : `before ${config.digestHour}:00 (shop clock ${currentShopTime(now)})`,
    };
  }

  const managers = await prisma.staff.findMany({
    where: {
      isActive: true,
      roles: { hasSome: [StaffRole.ADMIN, StaffRole.MANAGER] },
    },
    select: { email: true },
  });
  const to = managers.map((manager) => manager.email).filter((email): email is string => !!email);
  if (to.length === 0) {
    return { status: "skipped", reason: "nobody who runs the shop has an email address" };
  }

  /*
   * Claim before send, the same trade the reminder job documents: a crash
   * between the two costs one morning's brief, and the other ordering sends
   * the same email three times while the runner retries. The column is a shop
   * day key rather than an instant, so a runner restart cannot produce a
   * second one an hour later.
   */
  const claimed = await prisma.systemConfig.updateMany({
    where: {
      id: "global",
      // Null is its own arm. `NOT: { digestLastSentOn: today }` is SQL
      // `NOT (col = 'x')`, which is NULL rather than true on a shop that has
      // never sent one -- so the very first brief never claimed, and never went.
      OR: [{ digestLastSentOn: null }, { digestLastSentOn: { not: today } }],
    },
    data: { digestLastSentOn: today },
  });
  if (claimed.count === 0) return { status: "skipped", reason: "another run claimed today" };

  const { start, end } = shopDayRange(now);
  const [alerts, insights, bookedToday] = await Promise.all([
    serviceAlerts(),
    shopInsights(),
    prisma.appointment.count({ where: { scheduledAt: { gte: start, lt: end } } }),
  ]);

  // Non-fatal, like every other send in the app.
  await sendDailyDigest({
    to,
    day: now,
    bookedToday,
    alerts: alerts.map((alert) => ({ title: alert.title, detail: alert.detail })),
    insights: insights.map((insight) => ({
      title: insight.title,
      detail: insight.detail,
      evidence: insight.evidence,
    })),
  }).catch(console.error);

  return {
    status: "ran",
    acted: to.length,
    detail: `${alerts.length} alerts, ${insights.length} insights`,
  };
}

export const digestJob: ScheduledJob = {
  name: "digest",
  blurb: "Mails the morning brief to whoever runs the shop.",
  // The hour is the gate; this only has to tick often enough to catch it.
  everyMins: 30,
  run: sendMorningDigest,
};
