import { LEADERBOARD_WINDOW_DAYS, getLeaderboard, getShopAnalytics } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";
import { formatRole, formatServiceType, formatShopDate } from "@/lib/utils";
import { shopInsights } from "@/lib/insights";
import { MIN_COHORT_SIZE, RETURN_WINDOW_DAYS, retention } from "@/lib/retention";
import InsightList from "@/components/InsightList";
import Link from "next/link";
import { Meter, PageShell, PageSection } from "@/components/ui";
import { currentStaffCanManage } from "@/lib/staff-roles";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { redirect } from "next/navigation";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Analytics" };

/**
 * Business analytics and the groomer leaderboard, for managers and admins.
 *
 * It sits under Shop rather than Floor because of what is on it: the
 * leaderboard ranks the team against each other and the pay columns put every
 * groomer's estimated earnings on one screen. That is a management view of the
 * shop, not a tool for the floor.
 *
 * The staff dashboard still shows the per-groomer counts for today, and
 * /staff/team still shows a groomer their own numbers — nobody lost sight of
 * their own work. This is the whole shop over a range.
 *
 * Gated here as well as hidden from the sidebar: hiding a link is
 * presentation, and this URL was open to the whole team until now.
 */

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** "2026-03" as the shop would say it. Noon keeps the key off a zone boundary. */
function monthLabel(monthKey: string): string {
  return formatShopDate(new Date(`${monthKey}-15T12:00:00Z`), {
    month: "short",
    year: "numeric",
  });
}

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function AnalyticsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  if (!(await currentStaffCanManage())) redirect("/staff");

  const requested = Number(searchParams.range);
  const rangeDays = (RANGES as readonly number[]).includes(requested) ? requested : 30;

  const [shop, leaderboard, insights, config, comeback] = await Promise.all([
    getShopAnalytics(rangeDays),
    getLeaderboard(),
    shopInsights(),
    getConfig(),
    // Not bound to the range control above it: a cohort's window is 90 days,
    // so "the last 7 days" is not a question this one can be asked.
    retention(),
  ]);
  // Off, and the taken column is a row of zeroes describing a feature the shop
  // does not use.
  const counterPayments = isEnabled(config, "featureCounterPayments");

  const ranked = leaderboard.filter((row) => row.isActive && row.lifetime > 0);
  const idle = leaderboard.filter((row) => row.isActive && row.lifetime === 0);
  const busiestDay = shop.perDay.reduce<{ dayKey: string; finished: number } | null>(
    (best, day) => (best === null || day.finished > best.finished ? day : best),
    null
  );
  const peakServices = shop.serviceMix.slice(0, 5);
  // Every 30-day bar in the table is drawn against the leader, not its own row.
  const topMonth = ranked.reduce((best, row) => Math.max(best, row.month), 0);
  const mixTotal = shop.serviceMix.reduce((n, row) => n + row.count, 0);
  const outcomeTotal = Math.max(shop.finished + shop.cancelled + shop.noShows, 1);
  const outcomes = [
    { label: "Finished", value: shop.finished, color: "bg-emerald-700", text: "text-emerald-700" },
    { label: "Cancelled", value: shop.cancelled, color: "bg-rose-700", text: "text-rose-700" },
    { label: "No-show", value: shop.noShows, color: "bg-amber-700", text: "text-amber-700" },
  ].filter((outcome) => outcome.value > 0);
  // Ranked, not categorical: first place is the darkest the label still reads on.
  const mixColors = ["bg-sky-400", "bg-violet-400", "bg-emerald-400", "bg-rose-400", "bg-amber-400"];

  /*
   * The four figures the shop leads with. Each carries the share it is of, so
   * the tile reads as a proportion and not only a count; turnaround has no
   * denominator, so it keeps the tile and loses the bar.
   */
  const headline: {
    label: string;
    value: string | number;
    hint: string;
    tile: string;
    bar?: string;
    share?: { used: number; total: number };
  }[] = [
    {
      label: "Finished",
      value: shop.finished,
      hint: `of ${shop.booked} booked`,
      tile: "bg-emerald-100 text-emerald-900",
      bar: "bg-emerald-400",
      share: { used: shop.finished, total: shop.booked },
    },
    {
      label: "Walk-ins",
      value: shop.walkIns,
      hint: `${shop.scheduledAppointments} pre-booked`,
      tile: "bg-sky-100 text-sky-900",
      bar: "bg-sky-400",
      share: { used: shop.walkIns, total: shop.walkIns + shop.scheduledAppointments },
    },
    {
      label: "No-show rate",
      value: percent(shop.noShowRate),
      hint: `${shop.noShows} no-shows, ${shop.cancelled} cancelled`,
      tile: "bg-amber-100 text-amber-900",
      bar: "bg-amber-400",
      share: { used: Math.round(shop.noShowRate * 100), total: 100 },
    },
    {
      label: "Avg turnaround",
      value: shop.avgTurnaroundMins != null ? `${shop.avgTurnaroundMins} min` : "—",
      hint: "check-in to finished",
      tile: "bg-violet-100 text-violet-900",
    },
  ];

  return (
    <PageShell
      title="Analytics"
      subtitle={`Last ${rangeDays} days, measured from appointments and their status history.`}
      actions={
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
      }
    >
      {/* What the numbers are saying */}
      <PageSection title="Insights">
        <InsightList insights={insights} snoozable />
      </PageSection>

      {/* Headline numbers */}
      <PageSection tone="muted" bodyClassName="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {headline.map(({ label, value, hint, tile, bar, share }) => (
          <div key={label} className={`rounded-xl p-4 ${tile}`}>
            <p className="text-4xl font-black leading-none tracking-tight tabular-nums">{value}</p>
            <p className="mt-1.5 text-sm font-semibold">{label}</p>
            {share && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60">
                <div
                  className={`h-full rounded-full ${bar}`}
                  style={{
                    width: `${share.total === 0 ? 0 : Math.min(100, Math.round((share.used / share.total) * 100))}%`,
                  }}
                />
              </div>
            )}
            <p className="mt-1.5 text-xs opacity-70">{hint}</p>
          </div>
        ))}
      </PageSection>

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Volume */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            Finished per day
          </h2>
          {shop.perDay.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing finished in this range yet.</p>
          ) : (
            <>
              <div className="flex h-32 items-end gap-1 border-b border-stone-200">
                {shop.perDay.map((day) => {
                  const peak = busiestDay?.finished ?? 1;
                  const isPeak = day.finished === peak && peak > 0;
                  return (
                    <div
                      key={day.dayKey}
                      title={`${day.dayKey}: ${day.finished}`}
                      /* The peak column is the one the eye should land on; the
                         rest are the same amber a step back, so the shape of
                         the range reads before any single day does. */
                      className={`flex-1 rounded-t transition-opacity hover:opacity-80 ${
                        isPeak ? "bg-orange-500" : "bg-amber-300"
                      }`}
                      style={{ height: `${Math.max((day.finished / peak) * 100, 4)}%` }}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-stone-400 mt-2">
                Busiest day {busiestDay?.dayKey} with {busiestDay?.finished} finished ·{" "}
                {(shop.finished / rangeDays).toFixed(1)} per day on average
              </p>
              <ul className="sr-only">
                {shop.perDay.map((day) => <li key={day.dayKey}>{day.dayKey}: {day.finished} finished</li>)}
              </ul>
            </>
          )}
        </section>

        {/* Money and mix */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3">
            Service mix
          </h2>
          {peakServices.length === 0 ? (
            <p className="text-sm text-stone-400">No services booked in this range.</p>
          ) : (
            <ul className="space-y-1.5">
              {peakServices.map((row, index) => (
                <li key={row.serviceType}>
                  <Meter
                    label={formatServiceType(row.serviceType)}
                    used={row.count}
                    total={mixTotal}
                    display={String(row.count)}
                    bar={mixColors[index % mixColors.length]}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-stone-100 text-sm space-y-1">
            <p className="text-stone-700">
              <span className="font-bold">{formatCents(shop.estimatedRevenueCents)}</span> at list
              price
            </p>
            {/* Taken is a fact; everything above it is a floor. */}
            {counterPayments && (
              <p className="text-stone-700">
                <span className="font-bold">{formatCents(shop.takenCents)}</span> taken
                {shop.tipsCents > 0 && (
                  <span className="text-xs text-stone-500">
                    {" "}
                    · {formatCents(shop.tipsCents)} of it tips, which are the groomers&apos;
                  </span>
                )}
              </p>
            )}
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
      </PageSection>

      {/* Appointment outcomes */}
      <PageSection title="Appointment outcomes" hint={`Last ${rangeDays} days`}>
        {outcomes.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">No appointment outcomes in this range yet.</p>
        ) : (
          <>
            <div className="mt-4 flex h-7 overflow-hidden rounded-lg bg-stone-100" aria-hidden="true">
              {outcomes.map((outcome) => (
                <div
                  key={outcome.label}
                  className={`flex items-center justify-center text-[11px] font-black text-white ${outcome.color}`}
                  style={{ width: `${(outcome.value / outcomeTotal) * 100}%` }}
                >
                  {/* A share under a tenth has no room for its own figure — the
                      legend below carries every one of them. */}
                  {outcome.value / outcomeTotal >= 0.1 && percent(outcome.value / outcomeTotal)}
                </div>
              ))}
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {outcomes.map((outcome) => (
                <li key={outcome.label} className="flex items-center justify-between rounded-lg bg-well px-3 py-2 text-sm ring-1 ring-well-line">
                  <span className="flex items-center gap-2 text-stone-600"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${outcome.color}`} />{outcome.label}</span>
                  <span className={`font-black ${outcome.text}`}>{outcome.value} <span className="text-xs font-medium">{percent(outcome.value / outcomeTotal)}</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageSection>

      {/* Customers */}
      <PageSection tone="muted" bodyClassName="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "New customers", value: shop.newCustomers },
          { label: "Booked more than once", value: percent(shop.returningShare) },
          { label: "Walk-ins", value: shop.walkIns },
          { label: "Cancelled", value: shop.cancelled },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-white px-3 py-2 ring-1 ring-well-line">
            <p className="text-3xl font-black leading-none tracking-tight tabular-nums text-stone-900">
              {value}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-stone-500">{label}</p>
          </div>
        ))}
      </PageSection>

      {/* Do they come back? Everything above this point is throughput. */}
      <PageSection
        title="First visits, and who came back"
        hint={`Within ${RETURN_WINDOW_DAYS} days · all time`}
      >
        {comeback.cohorts.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">
            No finished visits yet, so there is nobody to have come back.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="text-4xl font-black leading-none tracking-tight tabular-nums text-stone-900">
                {comeback.returnRate == null ? "—" : percent(comeback.returnRate)}
              </p>
              <p className="text-sm text-stone-600">
                {comeback.returnRate == null ? (
                  <>
                    Not enough settled history to put a figure on it yet. A month is rated once
                    every first-timer in it has had {RETURN_WINDOW_DAYS} days and there are at
                    least {MIN_COHORT_SIZE} of them.
                  </>
                ) : (
                  <>
                    of first-time customers booked again within {RETURN_WINDOW_DAYS} days —{" "}
                    <span className="font-bold text-stone-900">
                      {comeback.ratedReturns} of {comeback.ratedCustomers}
                    </span>
                    .
                    {comeback.trend && Math.abs(comeback.trend.change) >= 0.05 && (
                      <>
                        {" "}
                        {comeback.trend.change > 0 ? "Up" : "Down"}{" "}
                        <span
                          className={`font-bold ${comeback.trend.change > 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {percent(Math.abs(comeback.trend.change))}
                        </span>{" "}
                        on the month before.
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
            <ul className="mt-4 space-y-1.5">
              {comeback.cohorts.map((month) => (
                <li key={month.monthKey}>
                  <Meter
                    label={monthLabel(month.monthKey)}
                    used={month.returnedInWindow}
                    total={month.size}
                    display={
                      month.rate == null
                        ? `${month.size} new · ${month.mature ? "too few to rate" : "still early"}`
                        : `${month.returnedInWindow}/${month.size} · ${percent(month.rate)}`
                    }
                    /* High is good here, so the capacity ramp — which paints a
                       full bar red — would say the opposite of what it means. */
                    bar={month.rate == null ? "bg-stone-200" : "bg-emerald-400"}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-stone-400">
              Grouped by the month of a customer&apos;s first finished visit, so each row is a
              fixed group of people and the months are comparable. A month stays unrated until
              its newest first-timer has had the full {RETURN_WINDOW_DAYS} days
              {comeback.cohorts.some((month) => month.loyal > 0) && (
                <>
                  {" "}
                  · {comeback.cohorts.reduce((sum, month) => sum + month.loyal, 0)} of them have
                  since been in three times or more
                </>
              )}
              .
            </p>
          </>
        )}
      </PageSection>

      {/* Leaderboard */}
      <PageSection title="Groomer leaderboard">
        <div className="flex items-baseline justify-end gap-3 flex-wrap mb-2">
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
          <div className="border border-stone-200 rounded-lg bg-well p-4 text-center text-stone-400 text-sm">
            No finished visits credited to a groomer yet.
          </div>
        ) : (
          <div className="border border-stone-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-well text-stone-500 text-[10px] tracking-tight">
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
                    {counterPayments && (
                      <th scope="col" className="px-3 py-2 text-right">Tips 7d</th>
                    )}
                    <th scope="col" className="px-3 py-2 text-left">Badges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {ranked.map((row, index) => (
                    <tr key={row.staffId} className={index === 0 ? "bg-amber-50/60" : ""}>
                      <td className="px-3 py-2 font-black text-stone-400">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold text-stone-900">
                        {row.name}
                        {index === 0 && <span className="ml-1.5" role="img" aria-label="Top groomer">🏆</span>}
                        <span className="block text-[10px] font-medium text-stone-400">
                          {row.roles.map(formatRole).join(" · ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{row.today}</td>
                      <td className="px-3 py-2 text-right">{row.week}</td>
                      <td className="px-3 py-2 text-right font-bold text-stone-900">
                        <span className="relative flex h-6 items-center justify-end rounded bg-well px-1.5 ring-1 ring-well-line">
                          <span
                            className="absolute inset-y-0 left-0 rounded bg-amber-300"
                            style={{ width: `${topMonth === 0 ? 0 : (row.month / topMonth) * 100}%` }}
                          />
                          <span className="relative tabular-nums">{row.month}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-stone-500">{row.lifetime}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{row.bestDay}</td>
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.streak > 0 ? `${row.streak}d` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.avgTurnaroundMins != null ? `${row.avgTurnaroundMins}m` : "—"}
                      </td>
                      {/* The blended rate is what the month's work actually
                          paid at; the base is only the fallback for a line
                          with no exception of its own. */}
                      <td className="px-3 py-2 text-right text-stone-500">
                        {row.effectiveRatePercent != null &&
                        Math.round(row.effectiveRatePercent * 10) !==
                          Math.round(row.commissionPercent * 10) ? (
                          <>
                            {row.effectiveRatePercent.toFixed(1)}%
                            <span className="block text-[10px] text-stone-400">
                              base {row.commissionPercent}%
                            </span>
                          </>
                        ) : (
                          `${row.commissionPercent}%`
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-700">
                        {formatCents(row.payTodayCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-stone-900">
                        {formatCents(row.payWeekCents)}
                        {row.payMonthFlooredByCents > 0 && (
                          <span className="block text-[10px] font-medium text-stone-400">
                            30d lifted {formatCents(row.payMonthFlooredByCents)}
                          </span>
                        )}
                      </td>
                      {/* Beside the commission estimate, never inside it: a tip
                          is the customer's, and commission is the shop's. */}
                      {counterPayments && (
                        <td className="px-3 py-2 text-right text-emerald-800">
                          {row.tipWeekCents > 0 ? formatCents(row.tipWeekCents) : "—"}
                        </td>
                      )}
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
      </PageSection>
    </PageShell>
  );
}
