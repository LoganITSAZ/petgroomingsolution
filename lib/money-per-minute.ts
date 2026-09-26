import type { Insight } from "@/lib/insights";
import { sizeName, type PetSize } from "@/lib/pet-size";
import { PRICE_STEP_CENTS, formatCents } from "@/lib/pricing";
import { median } from "@/lib/rhythm";

/**
 * What the shop's time earns: each visit's ticket against its hands-on
 * minutes, grouped the way the price list is — service by size — and, inside
 * that, by breed, for the dogs a size price does not cover.
 *
 * The ticket is before discounts. A legacy rate or a reward punch is a price
 * the shop agreed on purpose; counting it would make a service full of
 * regulars look underpriced and raise the list price for everybody. Surcharges
 * stay in — a breed fee already charged is what pays for that breed's time.
 *
 * Pure. The queried half is `lib/money-per-minute-queries.ts`.
 */

/** A pricing claim needs more than the usual three visits. */
export const MIN_VISITS_FOR_PRICE = 5;

export const PRICE_WINDOW_DAYS = 90;

/** Both must clear, so neither a trivial service nor a noisy one is reported. */
const GAP_SHARE = 0.15;
const GAP_CENTS_PER_HOUR = 1_000;

const MAX_PRICE_INSIGHTS = 3;

export interface PricedLine {
  serviceId: string | null;
  serviceName: string | null;
  sizeTier: PetSize | null;
  /** The catalog row prices by size. False for a flat service or a deleted one. */
  sizePriced: boolean;
  priceCents: number | null;
}

export interface PricedVisit {
  workedMins: number;
  /** Services plus surcharges, before any discount. Tips are not the shop's price. */
  ticketCents: number;
  lines: PricedLine[];
  breedKey: string | null;
  breedLabel: string | null;
}

export interface PriceGroup {
  key: string;
  label: string;
  visits: number;
  /** Whole dollars an hour, in cents. Null below `MIN_VISITS_FOR_PRICE`. */
  rateCents: number | null;
  medianMins: number | null;
  medianTicketCents: number | null;
  /** What a typical visit would need on top to earn the benchmark rate. */
  suggestCents: number | null;
  /** How far under the benchmark, 0.2 for 20%. Null when nothing is claimed. */
  gap: number | null;
  evidence: string;
}

export interface PriceRow extends PriceGroup {
  serviceId: string;
  size: PetSize | null;
  breeds: PriceGroup[];
}

export interface MoneyPerHour {
  shopRateCents: number | null;
  shopVisits: number;
  rows: PriceRow[];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Weighted: total ticket over total hours, so a busy service weighs more. */
export function rateCents(visits: PricedVisit[]): number | null {
  const mins = sum(visits.map((visit) => visit.workedMins));
  if (mins <= 0) return null;
  const perHour = (sum(visits.map((visit) => visit.ticketCents)) * 60) / mins;
  return Math.round(perHour / 100) * 100;
}

export function clearsGap(rateCents: number, benchmarkCents: number): boolean {
  const short = benchmarkCents - rateCents;
  return short >= GAP_CENTS_PER_HOUR && short / benchmarkCents >= GAP_SHARE;
}

/**
 * `Math.round`, not `roundToStep()`: that one never returns less than $5, and
 * a gap that rounds to nothing must suggest nothing.
 */
export function suggestedExtraCents(benchmarkCents: number, medianMins: number, medianTicketCents: number): number | null {
  const short = (benchmarkCents * medianMins) / 60 - medianTicketCents;
  const rounded = Math.round(short / PRICE_STEP_CENTS) * PRICE_STEP_CENTS;
  return rounded > 0 ? rounded : null;
}

/** The shop's own guide wins; otherwise the typed breed, case and spacing folded. */
export function breedGroup(typed: string | null, guideName: string | null): { key: string; label: string } | null {
  const label = (guideName ?? typed)?.trim().replace(/\s+/g, " ");
  return label ? { key: label.toLowerCase(), label } : null;
}

/** A visit the arithmetic can trust: measured, and every line priced. */
function countable(visit: PricedVisit): boolean {
  return visit.workedMins > 0 && visit.lines.length > 0 && visit.lines.every((line) => line.priceCents != null);
}

/**
 * The row a visit belongs to, or null. Only a one-line visit has one: time on
 * a visit with add-ons cannot be split between its lines.
 */
function rowOf(visit: PricedVisit): { key: string; serviceId: string; size: PetSize | null; label: string } | null {
  if (visit.lines.length !== 1) return null;
  const [line] = visit.lines;
  if (!line.serviceId || !line.serviceName) return null;
  if (line.sizePriced && !line.sizeTier) return null;
  const size = line.sizePriced ? line.sizeTier : null;
  return {
    key: `${line.serviceId}:${size ?? "ANY"}`,
    serviceId: line.serviceId,
    size,
    label: size ? `${line.serviceName}, ${sizeName(size)}` : line.serviceName,
  };
}

function measure(key: string, label: string, visits: PricedVisit[], benchmarkCents: number | null, rangeDays: number): PriceGroup {
  const empty = { key, label, visits: visits.length, rateCents: null, medianMins: null, medianTicketCents: null, suggestCents: null, gap: null };
  if (visits.length < MIN_VISITS_FOR_PRICE) {
    return { ...empty, evidence: `${visits.length} measured, ${MIN_VISITS_FOR_PRICE} needed` };
  }
  const rate = rateCents(visits);
  const medianMins = median(visits.map((visit) => visit.workedMins));
  const medianTicketCents = median(visits.map((visit) => visit.ticketCents));
  const evidence = `Median ${medianMins} min hands-on, ${visits.length} visits, last ${rangeDays} days. List prices before discounts.`;
  let suggestCents: number | null = null;
  let gap: number | null = null;
  if (rate != null && benchmarkCents != null && medianMins != null && medianTicketCents != null && clearsGap(rate, benchmarkCents)) {
    suggestCents = suggestedExtraCents(benchmarkCents, medianMins, medianTicketCents);
    // A gap with nothing to do is not worth a line in the morning brief.
    if (suggestCents != null) gap = 1 - rate / benchmarkCents;
  }
  return { ...empty, rateCents: rate, medianMins, medianTicketCents, suggestCents, gap, evidence };
}

export function moneyPerHour(visits: PricedVisit[], rangeDays: number): MoneyPerHour {
  const counted = visits.filter(countable);
  const shopRateCents = rateCents(counted);

  const rows = new Map<string, { serviceId: string; size: PetSize | null; label: string; visits: PricedVisit[] }>();
  for (const visit of counted) {
    const row = rowOf(visit);
    if (!row) continue;
    const entry = rows.get(row.key) ?? { ...row, visits: [] };
    entry.visits.push(visit);
    rows.set(row.key, entry);
  }

  const measured = [...rows.entries()].map(([key, entry]): PriceRow => {
    const row = measure(key, entry.label, entry.visits, shopRateCents, rangeDays);
    const byBreed = new Map<string, { label: string; visits: PricedVisit[] }>();
    for (const visit of entry.visits) {
      if (!visit.breedKey || !visit.breedLabel) continue;
      const breed = byBreed.get(visit.breedKey) ?? { label: visit.breedLabel, visits: [] };
      breed.visits.push(visit);
      byBreed.set(visit.breedKey, breed);
    }
    // A breed is judged against its own row, so the row must have a rate.
    const breeds =
      row.rateCents == null
        ? []
        : [...byBreed.entries()]
            .map(([breedKey, breed]) => measure(`${key}:${breedKey}`, breed.label, breed.visits, row.rateCents, rangeDays))
            .filter((breed) => breed.rateCents != null);
    return { ...row, serviceId: entry.serviceId, size: entry.size, breeds };
  });

  // Claimed rows first, cheapest first; the rest by how close they are.
  measured.sort((a, b) =>
    a.rateCents != null && b.rateCents != null ? a.rateCents - b.rateCents : a.rateCents != null ? -1 : b.rateCents != null ? 1 : b.visits - a.visits
  );

  return { shopRateCents, shopVisits: counted.length, rows: measured };
}

export function priceInsights(summary: MoneyPerHour): Insight[] {
  const found: { gap: number; insight: Insight }[] = [];
  const perHour = (cents: number | null) => `${formatCents(cents)}/hr`;

  for (const row of summary.rows) {
    if (row.gap != null && row.suggestCents != null && row.medianTicketCents != null) {
      found.push({
        gap: row.gap,
        insight: {
          id: `price-rate:${row.key}`,
          tone: "opportunity",
          title: `${row.label} earns ${perHour(row.rateCents)} against the shop's ${perHour(summary.shopRateCents)}`,
          detail: `At the shop rate the time is worth about ${formatCents(row.medianTicketCents + row.suggestCents)} against a typical ${formatCents(row.medianTicketCents)} today — about ${formatCents(row.suggestCents)} more.`,
          evidence: row.evidence,
          href: "/admin/services",
        },
      });
    }
    for (const breed of row.breeds) {
      if (breed.gap == null || breed.suggestCents == null) continue;
      found.push({
        gap: breed.gap,
        insight: {
          id: `price-breed:${breed.key}`,
          tone: "opportunity",
          title: `${breed.label} on ${row.label} earn ${perHour(breed.rateCents)} against ${perHour(row.rateCents)} for the ${row.size ? "size" : "service"}`,
          detail: `About ${formatCents(breed.suggestCents)} more per visit would bring them level.`,
          evidence: breed.evidence,
          href: "/admin/services",
        },
      });
    }
  }

  return found
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_PRICE_INSIGHTS)
    .map((entry) => entry.insight);
}
