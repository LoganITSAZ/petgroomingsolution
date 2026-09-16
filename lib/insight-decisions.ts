import { prisma } from "@/lib/prisma";
import type { Insight } from "@/lib/insights";

/**
 * "We know. We have dealt with it."
 *
 * Shop insights are derived every time they are asked for, so they have no
 * state to carry an acknowledgement in. Without one the same line — no-shows
 * are up, four households are due back — sits on the dashboard for a fortnight
 * after the manager rang everybody, and the list stops being read at all.
 *
 * A snooze, never a permanent dismissal. The insight is a live reading of the
 * shop's own records: if the condition comes back, the shop wants to hear about
 * it again. Switching a derived signal off for good is how a dashboard turns
 * into wallpaper with extra steps.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the buttons offer. Anything longer is a decision to change something. */
export const SNOOZE_OPTIONS = [
  { days: 1, label: "Not today" },
  { days: 7, label: "Handled — hide for a week" },
] as const;

export const MAX_SNOOZE_DAYS = 30;

/** Insight ids currently snoozed. */
export async function snoozedInsightIds(now: Date = new Date()): Promise<Set<string>> {
  const live = await prisma.insightDecision.findMany({
    where: { snoozedUntil: { gt: now } },
    select: { insightId: true },
  });
  return new Set(live.map((decision) => decision.insightId));
}

/**
 * Hide what somebody has already dealt with.
 *
 * Pure, and separate from the query, so the digest and the dashboard filter the
 * same way and a test needs no database.
 */
export function withoutSnoozed<T extends Pick<Insight, "id">>(insights: T[], snoozed: Set<string>): T[] {
  return insights.filter((insight) => !snoozed.has(insight.id));
}

/**
 * Put an observation away until a date.
 *
 * Upsert on the insight id: snoozing something already snoozed moves the date
 * rather than failing, which is what pressing the button twice means.
 */
export async function snoozeInsight({
  insightId,
  title,
  days,
  staffId,
  now = new Date(),
}: {
  insightId: string;
  title: string;
  days: number;
  staffId: string | null;
  now?: Date;
}): Promise<Date> {
  // Clamped rather than trusted: the value is posted from a form, and a snooze
  // measured in years is the permanent dismissal this deliberately is not.
  const clamped = Math.min(Math.max(1, Math.floor(days)), MAX_SNOOZE_DAYS);
  const snoozedUntil = new Date(now.getTime() + clamped * DAY_MS);

  await prisma.insightDecision.upsert({
    where: { insightId },
    create: { insightId, title, snoozedUntil, decidedById: staffId },
    update: { title, snoozedUntil, decidedById: staffId, decidedAt: now },
  });
  return snoozedUntil;
}
