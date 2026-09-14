import Link from "next/link";
import type { ShopAnalytics } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";
import { PageSection } from "@/components/ui";

export function DashboardTrend({ snapshot, todayKey, canManageShop }: {
  snapshot: ShopAnalytics;
  todayKey: string;
  canManageShop: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${todayKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date),
      count: snapshot.perDay.find((day) => day.dayKey === key)?.finished ?? 0,
    };
  });
  const max = Math.max(1, ...days.map((day) => day.count));
  return (
    <PageSection title="Business pulse · last 7 days" hint="Includes today, still in progress" actions={canManageShop && <Link href="/staff/analytics" className="text-sm underline">Full analytics</Link>}>
      <div className="grid gap-6 md:grid-cols-2">
        <figure>
          <figcaption className="text-sm font-semibold text-ink">Finished grooms <span className="font-normal text-muted">· {snapshot.finished} total</span></figcaption>
          <div className="mt-3 flex h-36 items-end gap-2" role="img" aria-label={days.map((day) => `${day.key}: ${day.count} finished`).join("; ")}>
            {days.map((day, index) => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-hidden="true">
              <span className="text-xs font-bold tabular-nums text-ink">{day.count}</span>
              <div className={`w-full max-w-12 rounded-t ${index === 6 ? "bg-emerald-600" : "bg-emerald-300"}`} style={{ height: `${day.count / max * 90}px`, minHeight: 2 }} />
              <span className="text-xs text-muted">{index === 6 ? "Today" : day.label}</span>
            </div>)}
          </div>
          {snapshot.finished === 0 && <p className="mt-2 text-xs text-muted">No finished grooms recorded in this period.</p>}
        </figure>
        <dl className="grid grid-cols-2 gap-4 content-center">
          {canManageShop && <div className="col-span-2 rounded-lg bg-well p-3">
            <dt className="text-xs font-semibold text-muted">Estimated service revenue</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{formatCents(snapshot.estimatedRevenueCents)}</dd>
            <p className="mt-1 text-xs text-muted">Finished visits after agreed discounts; not collected payments. {Math.round(snapshot.pricedShare * 100)}% of finished visits have pricing.</p>
          </div>}
          <div><dt className="text-xs text-muted">Average turnaround</dt><dd className="mt-1 text-xl font-bold text-ink">{snapshot.avgTurnaroundMins == null ? "—" : `${snapshot.avgTurnaroundMins} min`}</dd><p className="text-xs text-muted">Check-in to finished</p></div>
          <div><dt className="text-xs text-muted">Missed appointments</dt><dd className="mt-1 text-xl font-bold text-ink">{snapshot.noShows + snapshot.cancelled}</dd><p className="text-xs text-muted">{snapshot.noShows} no-shows · {snapshot.cancelled} cancelled</p></div>
        </dl>
      </div>
    </PageSection>
  );
}
