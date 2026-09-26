import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { type BucketSummary, summariseVisitTimes, visitTime } from "@/lib/visit-time";

/**
 * The shop's typical visit over a range, stage by stage. Finished visits only:
 * a visit still on the table has no table figure yet. One query — the history
 * rides along with its visits.
 */
export async function visitTimeSummary(rangeDays: number, now: Date = new Date()): Promise<BucketSummary[]> {
  const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now } },
    select: { statusHistory: { select: { status: true, changedAt: true } } },
  });
  return summariseVisitTimes(visits.map((visit) => visitTime(visit.statusHistory, now)));
}
