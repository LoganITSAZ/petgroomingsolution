import Link from "next/link";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { formatCents } from "@/lib/pricing";
import {
  PAYMENT_METHOD_LABEL,
  paymentsBetween,
  takingsByMethod,
  unsettledVisits,
} from "@/lib/ticket";
import { formatShopDate, formatShopTime, formatStatus, shopDayRange } from "@/lib/utils";
import { PageShell, PageSection, Panel, StatStrip } from "@/components/ui";

export const metadata = { title: "Takings" };
export const dynamic = "force-dynamic";

/**
 * The end of the day, and the money that went home unpaid.
 *
 * Two halves, and the second is the one worth having: what the terminal took
 * today, and every finished visit with a balance, oldest first. The shop
 * reconciles the first half against Clover's own batch -- nothing here moves a
 * cent -- and works the second half with the phone.
 */
export default async function TakingsPage() {
  const config = await getConfig();
  // The page redirects itself: hiding the sidebar link is presentation.
  if (!isEnabled(config, "featureCounterPayments")) redirect("/staff");

  const { start, end } = shopDayRange();
  const [payments, owing] = await Promise.all([
    paymentsBetween(start, end),
    unsettledVisits(),
  ]);

  const byMethod = takingsByMethod(payments);
  const takenCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  const tipsCents = payments.reduce((total, payment) => total + payment.tipCents, 0);
  const owedCents = owing.reduce((total, row) => total + row.ticket.balanceCents, 0);

  // Tips belong to whoever finished the pet, so they are grouped by the
  // visit's groomer rather than by whoever stood at the counter.
  const tipsByGroomer = new Map<string, { name: string; tipCents: number }>();
  for (const payment of payments) {
    if (payment.tipCents === 0) continue;
    const groomer = payment.appointment.staff;
    const key = groomer?.id ?? "unassigned";
    const row = tipsByGroomer.get(key) ?? {
      name: groomer?.name ?? "Nobody assigned",
      tipCents: 0,
    };
    row.tipCents += payment.tipCents;
    tipsByGroomer.set(key, row);
  }
  const tipRows = [...tipsByGroomer.values()].sort((a, b) => b.tipCents - a.tipCents);

  return (
    <PageShell
      title="Takings"
      subtitle={`${formatShopDate(start)}. What the shop's terminal took today, and every finished visit still owing.`}
    >
      <StatStrip
        stats={[
          { label: "Taken today", value: formatCents(takenCents) },
          { label: "In tips", value: formatCents(tipsCents) },
          { label: "Payments", value: payments.length },
          { label: "Still owed", value: formatCents(owedCents) },
        ]}
      />

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="By method">
          {byMethod.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing taken yet today.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {byMethod.map((row) => (
                <li key={row.method} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {PAYMENT_METHOD_LABEL[row.method]}
                    <span className="block text-xs text-stone-500">
                      {row.count} payment{row.count === 1 ? "" : "s"}
                      {row.tipCents > 0 && ` · ${formatCents(row.tipCents)} of it tips`}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-semibold">
                    {formatCents(row.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-400 mt-2">
            Reconcile against the terminal&apos;s own batch. These are records of what happened
            there, not a second till.
          </p>
        </Panel>

        <Panel title="Tips by groomer">
          {tipRows.length === 0 ? (
            <p className="text-sm text-stone-400">No tips today.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {tipRows.map((row) => (
                <li key={row.name} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                  <span>{row.name}</span>
                  <span className="whitespace-nowrap font-semibold">{formatCents(row.tipCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-400 mt-2">
            A tip belongs to whoever finished the pet, and sits beside commission rather than
            inside it.
          </p>
        </Panel>
      </PageSection>

      <PageSection title={`Still owing (${owing.length})`} padded={false} bodyClassName="divide-y divide-stone-100">
        {owing.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-stone-400">
            Every finished visit is settled.
          </p>
        ) : (
          owing.map(({ visit, ticket }) => (
            <div key={visit.id} className="px-3 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">
                  <Link href={`/staff/appointments/${visit.id}`} className="hover:underline">
                    {visit.pet.name}
                  </Link>
                  <span className="ml-2 text-xs font-normal text-stone-500">
                    <Link href={`/staff/customers/${visit.customer.id}`} className="hover:underline">
                      {visit.customer.firstName} {visit.customer.lastName}
                    </Link>
                  </span>
                </p>
                <p className="text-xs text-stone-500">
                  {formatShopDate(visit.scheduledAt)} · {formatStatus(visit.status)} ·{" "}
                  {formatCents(ticket.dueCents)} due, {formatCents(ticket.paidCents - ticket.tipCents)}{" "}
                  paid
                </p>
              </div>

              <p className="text-sm font-semibold text-amber-800 whitespace-nowrap">
                {formatCents(ticket.balanceCents)} owed
              </p>

              {visit.customer.phone && (
                <a
                  href={`tel:${visit.customer.phone}`}
                  className="text-sm text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
                >
                  {visit.customer.phone}
                </a>
              )}
            </div>
          ))
        )}
      </PageSection>

      {payments.length > 0 && (
        <PageSection title="Today, in order" padded={false} bodyClassName="divide-y divide-stone-100">
          {payments.map((payment) => (
            <div key={payment.id} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="w-20 text-stone-500">{formatShopTime(payment.takenAt)}</span>
              <span className="min-w-0 flex-1">
                <Link href={`/staff/appointments/${payment.appointment.id}`} className="hover:underline">
                  {payment.appointment.pet.name}
                </Link>
                <span className="text-stone-500">
                  {" "}
                  · {payment.appointment.customer.firstName}{" "}
                  {payment.appointment.customer.lastName} · {PAYMENT_METHOD_LABEL[payment.method]}
                  {payment.reference ? ` · ref ${payment.reference}` : ""} · {payment.takenBy.name}
                </span>
              </span>
              <span className="whitespace-nowrap">
                {formatCents(payment.amountCents)}
                {payment.tipCents > 0 && (
                  <span className="text-stone-500"> ({formatCents(payment.tipCents)} tip)</span>
                )}
              </span>
            </div>
          ))}
        </PageSection>
      )}
    </PageShell>
  );
}
