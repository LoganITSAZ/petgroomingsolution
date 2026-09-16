import Link from "next/link";
import type { PaymentMethod, Surcharge } from "@prisma/client";
import { formatCents } from "@/lib/pricing";
import { formatShopDate, formatShopTime } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL, SURCHARGE_STEP_CENTS, type Ticket } from "@/lib/ticket";
import { addSurcharge, recordPayment, removePayment, removeSurcharge } from "@/app/staff/money-actions";

/**
 * The ticket, and the two things done to it.
 *
 * The shop's own Clover terminal takes the money; this is the number staff read
 * out and the record of what came back. Rendered on the visit screen in full,
 * and as the surcharge form alone on the station job aid — matting is found an
 * hour before anybody thinks about a total.
 */

export interface SurchargeLine {
  id: string;
  label: string;
  amountCents: number;
  aboveRange: boolean;
  note: string | null;
  createdAt: Date;
  addedBy: { id: string; name: string };
}

export interface PaymentLine {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  reference: string | null;
  note: string | null;
  takenAt: Date;
  takenBy: { id: string; name: string };
}

type SurchargeOption = Pick<Surcharge, "id" | "label" | "minCents" | "maxCents" | "note">;

const inputClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white";

/** The published range, as the counter reads it out. */
function rangeLabel(option: SurchargeOption): string {
  if (option.minCents == null && option.maxCents == null) return "";
  if (option.minCents != null && option.maxCents != null) {
    return option.minCents === option.maxCents
      ? ` (${formatCents(option.minCents)})`
      : ` (${formatCents(option.minCents)}–${formatCents(option.maxCents)})`;
  }
  return ` (from ${formatCents(option.minCents ?? option.maxCents)})`;
}

/**
 * Add a fee found on the table.
 *
 * The published range is advisory: a genuinely awful coat is charged above it
 * and the row is flagged rather than refused. Severity steps are $10 — light
 * matting $10, extreme $50 or more — so the input steps in tens.
 */
export function SurchargeForm({
  appointmentId,
  options,
  returnTo,
}: {
  appointmentId: string;
  options: SurchargeOption[];
  returnTo: string;
}) {
  return (
    <form action={addSurcharge} className="space-y-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="block text-xs font-medium text-stone-600 mb-1">Fee</span>
          {options.length > 0 ? (
            <select name="surchargeId" className={inputClass} defaultValue="">
              <option value="">Something else…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {rangeLabel(option)}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="label"
              placeholder="Matting"
              className={inputClass}
              aria-label="What the fee is for"
            />
          )}
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-stone-600 mb-1">Amount ($)</span>
          <input
            name="amountCents"
            inputMode="decimal"
            step={SURCHARGE_STEP_CENTS / 100}
            type="number"
            min={0}
            placeholder="10"
            className={inputClass}
          />
        </label>
      </div>
      {options.length > 0 && (
        <input
          name="label"
          placeholder="Or type what it is for, if it is not on the list"
          className={inputClass}
          aria-label="What the fee is for"
        />
      )}
      <input
        name="note"
        placeholder="What was found — the owner will ask"
        className={inputClass}
        aria-label="Note"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Add fee
        </button>
      </div>
    </form>
  );
}

/** What the terminal took. The amount is the whole figure, tip included. */
function PaymentForm({
  appointmentId,
  balanceCents,
  returnTo,
}: {
  appointmentId: string;
  balanceCents: number;
  returnTo: string;
}) {
  return (
    <form action={recordPayment} className="space-y-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-sm">
          <span className="block text-xs font-medium text-stone-600 mb-1">How</span>
          <select name="method" className={inputClass} defaultValue="CARD">
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABEL[method]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-stone-600 mb-1">
            Total taken ($)
          </span>
          <input
            name="amountCents"
            inputMode="decimal"
            type="number"
            step={0.01}
            min={0}
            defaultValue={balanceCents > 0 ? (balanceCents / 100).toString() : ""}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-stone-600 mb-1">Of which tip ($)</span>
          <input
            name="tipCents"
            inputMode="decimal"
            type="number"
            step={0.01}
            min={0}
            placeholder="0"
            className={inputClass}
          />
        </label>
      </div>
      <input
        name="reference"
        placeholder="Terminal reference, for tracing a dispute later"
        className={inputClass}
        aria-label="Terminal reference"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">
          The total is what the customer handed over, tip included — the figure on the terminal.
        </p>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
        >
          Record payment
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  hint,
  tone = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
}) {
  return (
    <li className={`py-2 flex items-start justify-between gap-3 text-sm ${tone}`}>
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
      <span className="whitespace-nowrap">{value}</span>
    </li>
  );
}

/** The whole counter panel: what is owed, what was paid, and the two forms. */
export function TicketPanel({
  appointmentId,
  ticket,
  surcharges,
  payments,
  surchargeOptions,
  tierName,
  returnTo,
}: {
  appointmentId: string;
  ticket: Ticket;
  surcharges: SurchargeLine[];
  payments: PaymentLine[];
  surchargeOptions: SurchargeOption[];
  tierName?: string | null;
  returnTo: string;
}) {
  return (
    <section className="border border-stone-200 rounded-lg bg-well p-4">
      <h2 className="font-bold text-stone-700 text-xs tracking-tight mb-3 flex items-center justify-between gap-3">
        <span>Ticket</span>
        <span
          className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${
            ticket.settled
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-amber-50 text-amber-800 border-amber-200"
          }`}
        >
          {ticket.settled
            ? "Settled"
            : `${formatCents(ticket.balanceCents)} owed`}
        </span>
      </h2>

      <ul className="divide-y divide-stone-100 mb-3">
        <Row label="Services" value={formatCents(ticket.serviceCents)} />
        {surcharges.map((line) => (
          <li key={line.id} className="py-2 flex items-start justify-between gap-3 text-sm">
            <span>
              {line.label}
              {line.aboveRange && (
                <span className="ml-2 text-[10px] font-bold text-amber-700 uppercase">
                  above list
                </span>
              )}
              <span className="block text-xs text-stone-500">
                {line.note ? `${line.note} · ` : ""}
                {line.addedBy.name}, {formatShopDate(line.createdAt)}
              </span>
            </span>
            <span className="whitespace-nowrap flex items-center gap-2">
              {formatCents(line.amountCents)}
              <form action={removeSurcharge}>
                <input type="hidden" name="id" value={line.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="text-xs text-stone-400 hover:text-red-700 underline"
                  aria-label={`Remove ${line.label}`}
                >
                  remove
                </button>
              </form>
            </span>
          </li>
        ))}
        {ticket.discountCents > 0 && (
          <Row
            label={tierName ?? "Discounts"}
            hint="Quoted when this visit was booked, and rewards taken off it."
            value={`−${formatCents(ticket.discountCents)}`}
            tone="text-amber-800"
          />
        )}
        <Row
          label={<span className="font-semibold text-stone-900">Due</span>}
          value={<span className="font-semibold text-stone-900">{formatCents(ticket.dueCents)}</span>}
        />
        {payments.map((line) => (
          <li key={line.id} className="py-2 flex items-start justify-between gap-3 text-sm text-green-800">
            <span>
              {PAYMENT_METHOD_LABEL[line.method]}
              {line.tipCents > 0 && ` · ${formatCents(line.tipCents)} tip`}
              <span className="block text-xs text-stone-500">
                {line.takenBy.name}, {formatShopTime(line.takenAt)}
                {line.reference ? ` · ref ${line.reference}` : ""}
              </span>
            </span>
            <span className="whitespace-nowrap flex items-center gap-2">
              {formatCents(line.amountCents)}
              <form action={removePayment}>
                <input type="hidden" name="id" value={line.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="text-xs text-stone-400 hover:text-red-700 underline"
                  aria-label="Remove payment"
                >
                  remove
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>

      <details className="mb-2">
        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
          Add a fee found on the table
        </summary>
        <div className="mt-3">
          <SurchargeForm
            appointmentId={appointmentId}
            options={surchargeOptions}
            returnTo={returnTo}
          />
        </div>
      </details>

      <details open={!ticket.settled && ticket.dueCents > 0}>
        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
          Record a payment
        </summary>
        <div className="mt-3">
          <PaymentForm
            appointmentId={appointmentId}
            balanceCents={ticket.balanceCents}
            returnTo={returnTo}
          />
        </div>
      </details>

      <p className="text-xs text-stone-400 mt-3">
        Payment is taken on the shop&apos;s terminal. What is written here is the record of it —{" "}
        <Link href="/staff/payments" className="underline">
          the day&apos;s payments
        </Link>
        .
      </p>
    </section>
  );
}
