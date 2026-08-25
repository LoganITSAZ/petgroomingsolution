import { LEADERBOARD_WINDOW_DAYS, getLeaderboard, getShopAnalytics } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";
import { formatRole, formatServiceType } from "@/lib/utils";
import { shopInsights } from "@/lib/insights";
import InsightList from "@/components/InsightList";
import Link from "next/link";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Analytics" };

/**
 * Business analytics and the groomer leaderboard, open to all staff — the floor
 * works better when it can see the shop's numbers, not only its own day. The
 * staff dashboard still shows the per-groomer counts for today; this is the
 * whole shop over a range.
 */

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

interface PageProps {
  searchParams: { range?: string };
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const requested = Number(searchParams.range);
  const rangeDays = (RANGES as readonly number[]).includes(requested) ? requested : 30;

  const [shop, leaderboard, insights] = await Promise.all([
    getShopAnalytics(rangeDays),
    getLeaderboard(),
    shopInsights(),
  ]);

  const ranked = leaderboard.filter((row) => row.isActive && row.lifetime > 0);
  const idle = leaderboard.filter((row) => row.isActive && row.lifetime === 0);
  const busiestDay = shop.perDay.reduce<{ dayKey: string; finished: number } | null>(
    (best, day) => (best === null || day.finished > best.finished ? day : best),
    null
  );
  const peakServices = shop.serviceMix.slice(0, 5);
  const mixTotal = shop.serviceMix.reduce((n, row) => n + row.count, 0);

  const headline = [
    { label: "Finished", value: shop.finished, hint: `${shop.booked} booked` },
    {
      label: "Walk-ins",
      value: shop.walkIns,
      hint: `${shop.scheduledAppointments} pre-booked`,
    },
    {
      label: "No-show rate",
      value: percent(shop.noShowRate),
      hint: `${shop.noShows} no-shows, ${shop.cancelled} cancelled`,
    },
    {
      label: "Avg turnaround",
      value: shop.avgTurnaroundMins != null ? `${shop.avgTurnaroundMins} min` : "—",
      hint: "check-in to finished",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Analytics</h1>
          <p className="text-sm text-stone-500 mt-1">
            Last {rangeDays} days, measured from appointments and their status history.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {RANGES.map((days) => (
            <Link
              key={days}
              href={`/staff/analytics?range=${days}`}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                days === rangeDays
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {days}d
            </Link>
          ))}
        </div>
      </div>

      {/* What the numbers are saying */}
      <section>
        <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-2">
          Insights
        </h2>
        <InsightList insights={insights} />
      </section>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {headline.map(({ label, value, hint }) => (
          <div key={label} className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xl font-black text-stone-900">{value}</p>
            <p className="text-sm text-stone-600">{label}</p>
            <p className="text-xs text-stone-400">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Volume */}
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
            Finished per day
          </h2>
          {shop.perDay.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing finished in this range yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-1 h-28">
                {shop.perDay.map((day) => {
                  const peak = busiestDay?.finished ?? 1;
                  return (
                    <div
                      key={day.dayKey}
                      title={`${day.dayKey}: ${day.finished}`}
                      className="flex-1 bg-amber-500/80 hover:bg-amber-600 rounded-t transition-colors"
                      style={{ height: `${Math.max((day.finished / peak) * 100, 4)}%` }}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-stone-400 mt-2">
                Busiest day {busiestDay?.dayKey} with {busiestDay?.finished} finished ·{" "}
                {(shop.finished / rangeDays).toFixed(1)} per day on average
              </p>
            </>
          )}
        </section>

        {/* Money and mix */}
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
            Service mix
          </h2>
          {peakServices.length === 0 ? (
            <p className="text-sm text-stone-400">No services booked in this range.</p>
          ) : (
            <ul className="space-y-2">
              {peakServices.map((row) => (
                <li key={row.serviceType} className="text-sm">
                  <div className="flex justify-between text-stone-700">
                    <span>{formatServiceType(row.serviceType)}</span>
                    <span className="text-stone-400">{row.count}</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-stone-400"
                      style={{ width: `${mixTotal === 0 ? 0 : (row.count / mixTotal) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-stone-100 text-sm space-y-1">
            <p className="text-stone-700">
              <span className="font-bold">{formatCents(shop.estimatedRevenueCents)}</span> at list
              price
            </p>
            {shop.rateDiscountCents > 0 && (
              <p className="text-xs text-stone-500">
                After {formatCents(shop.rateDiscountCents)} off for agreed rates. Groomer commission
                is still paid on the list price.
              </p>
            )}
            <p className="text-xs text-stone-400">
              Lowest published price of every service booked on finished visits
              {shop.pricedShare < 1 && ` · ${percent(shop.pricedShare)} of visits had priced services`}
              . Actual tickets vary with pet size and surcharges.
            </p>
          </div>
        </section>
      </div>

      {/* Customers */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xl font-black text-stone-900">{shop.newCustomers}</p>
          <p className="text-xs text-stone-500">New customers</p>
        </div>
        <div>
          <p className="text-xl font-black text-stone-900">{percent(shop.returningShare)}</p>
          <p className="text-xs text-stone-500">Booked more than once</p>
        </div>
        <div>
          <p className="text-xl font-black text-stone-900">{shop.walkIns}</p>
          <p className="text-xs text-stone-500">Walk-ins</p>
        </div>
        <div>
          <p className="text-xl font-black text-stone-900">{shop.cancelled}</p>
          <p className="text-xs text-stone-500">Cancelled</p>
        </div>
      </section>

      {/* Leaderboard */}
      <section>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">
            Groomer leaderboard
          </h2>
          <p className="text-xs text-stone-500">
            Estimated commission ·{" "}
            <span className="font-semibold text-stone-800">
              {formatCents(ranked.reduce((sum, row) => sum + row.payTodayCents, 0))}
            </span>{" "}
            today ·{" "}
            <span className="font-semibold text-stone-800">
              {formatCents(ranked.reduce((sum, row) => sum + row.payWeekCents, 0))}
            </span>{" "}
            this week ·{" "}
            <Link href="/admin/staff" className="underline hover:text-stone-800">
              set rates
            </Link>
          </p>
        </div>
        {ranked.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
            No finished visits credited to a groomer yet.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">#</th>
                    <th scope="col" className="px-3 py-2 text-left">Groomer</th>
                    <th scope="col" className="px-3 py-2 text-right">Today</th>
                    <th scope="col" className="px-3 py-2 text-right">7d</th>
                    <th scope="col" className="px-3 py-2 text-right">30d</th>
                    <th scope="col" className="px-3 py-2 text-right">Lifetime</th>
                    <th scope="col" className="px-3 py-2 text-right">Best day</th>
                    <th scope="col" className="px-3 py-2 text-right">Streak</th>
                    <th scope="col" className="px-3 py-2 text-right">Avg time</th>
                    <th scope="col" className="px-3 py-2 text-right">Rate</th>
                    <th scope="col" className="px-3 py-2 text-right">Pay today</th>
                    <th scope="col" className="px-3 py-2 text-right">Pay 7d</th>
                    <th scope="col" className="px-3 py-2 text-left">Badges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {ranked.map((row, index) => (
                    <tr key={row.staffId} className={index === 0 ? "bg-amber-50/60" : ""}>
                      <td className="px-3 py-2 font-black text-stone-400">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold text-stone-900">
                        {row.name}
                        {index === 0 && <span className="ml-1.5">🏆</span>}
                        <span className="block text-[10px] font-medium text-stone-400">
                          {row.roles.map(formatRole).join(" · ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{row.today}</td>
                      <td className="px-3 py-2 text-right">{row.week}</td>
                      <td className="px-3 py-2 text-right font-bold text-stone-900">{row.month}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{row.lifetime}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{row.bestDay}</td>
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.streak > 0 ? `${row.streak}d` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.avgTurnaroundMins != null ? `${row.avgTurnaroundMins}m` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.commissionPercent}%
                      </td>
                      <td className="px-3 py-2 text-right text-stone-700">
                        {formatCents(row.payTodayCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-stone-900">
                        {formatCents(row.payWeekCents)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {row.badges.map((badge) => (
                            <span
                              key={badge.key}
                              title={badge.detail}
                              className="bg-stone-100 text-stone-600 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            >
                              {badge.label}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {idle.length > 0 && (
              <p className="px-3 py-2 border-t border-stone-100 text-xs text-stone-400">
                No finished visits yet: {idle.map((row) => row.name).join(", ")}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-stone-400 mt-2">
          A visit counts once it reaches Complete, Ready for pickup or Picked up, credited to the
          assigned groomer — or, when nobody was assigned, to whoever closed it out. Lifetime is
          every visit on record; best day, streak and pay are measured over the last{" "}
          {LEADERBOARD_WINDOW_DAYS} days. Pay is that
          groomer&apos;s commission on the list price of the services they finished: a floor, not a
          payroll figure, since real tickets move with pet size and surcharges.
        </p>
      </section>
    </div>
  );
}
