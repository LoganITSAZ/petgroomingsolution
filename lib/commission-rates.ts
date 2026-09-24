import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import type { CommissionRates } from "@/lib/commission";

/**
 * The queried half of [lib/commission.ts](lib/commission.ts) — the arithmetic
 * stays pure and testable, this loads the rows it runs on.
 *
 * One query for every exception in the shop and one for the people: rates are a
 * handful of rows, and a lookup per groomer on a leaderboard is what turns a
 * page into forty of them.
 */
export async function commissionRatesByStaff(
  staff: { id: string; commissionPercent: number | null }[]
): Promise<Map<string, CommissionRates>> {
  const config = await getConfig();
  const shopPercent = config.defaultCommissionPercent;
  const exceptions =
    staff.length === 0
      ? []
      : await prisma.staffCommissionRate.findMany({
          where: { staffId: { in: staff.map((member) => member.id) } },
          select: { staffId: true, serviceId: true, category: true, percent: true },
        });

  return new Map(
    staff.map((member) => {
      const mine = exceptions.filter((row) => row.staffId === member.id);
      return [
        member.id,
        {
          byService: Object.fromEntries(
            mine.filter((row) => row.serviceId).map((row) => [row.serviceId as string, row.percent])
          ),
          byCategory: Object.fromEntries(
            mine.filter((row) => row.category).map((row) => [row.category!, row.percent])
          ),
          staffPercent: member.commissionPercent,
          shopPercent,
        } satisfies CommissionRates,
      ];
    })
  );
}

/**
 * Minutes each person was **scheduled** inside a window, which is what the
 * hourly floor is read off — the same rule overtime follows in
 * [lib/schedule.ts](lib/schedule.ts). Only the part of a shift falling inside
 * the window counts, so one straddling midnight is not paid twice.
 */
export async function scheduledMinutesByStaff(
  staffIds: string[],
  windowStart: Date,
  windowEnd: Date
): Promise<Map<string, number>> {
  if (staffIds.length === 0) return new Map();

  const shifts = await prisma.staffShift.findMany({
    where: { staffId: { in: staffIds }, startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } },
    select: { staffId: true, startsAt: true, endsAt: true },
  });

  const minutes = new Map<string, number>();
  for (const shift of shifts) {
    const from = Math.max(shift.startsAt.getTime(), windowStart.getTime());
    const to = Math.min(shift.endsAt.getTime(), windowEnd.getTime());
    if (to <= from) continue;
    minutes.set(shift.staffId, (minutes.get(shift.staffId) ?? 0) + Math.round((to - from) / 60000));
  }
  return minutes;
}
