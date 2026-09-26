# Money per Minute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each service × size's ticket beside its hands-on hours, on Analytics and as shop insights that suggest a price or a breed fee.

**Architecture:** A pure module (`lib/money-per-minute.ts`) groups plain visit rows, computes weighted rates, applies the 5-visit floor and both gap thresholds, and builds the suggestion and the `Insight[]`. A queried module beside it loads finished visits with their history, lines, surcharges and breed in one query and maps them to those rows. `shopInsights()` and the Analytics page read the queried module; nothing is stored.

**Tech Stack:** Next 16 App Router, TypeScript strict, Prisma 5.22, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-money-per-minute-design.md`

## Global Constraints

- Money is the ticket **before discounts**: `serviceCents + surchargeCents` from `ticketFor()` (`lib/ticket.ts`), never tips.
- Rate is weighted: total ticket ÷ total hands-on hours. Displayed and compared in whole dollars an hour (cents, rounded to 100).
- `MIN_VISITS_FOR_PRICE = 5`; a claim needs **both** ≥ 15% **and** ≥ $10/hr below its benchmark.
- A row's benchmark is the shop rate; a breed's is its own row's rate.
- Suggestion: `benchmark × medianMins / 60 − medianTicket`, rounded with `Math.round` to `PRICE_STEP_CENTS` ($5) — never `roundToStep()`, which floors at $5.
- Ruling (plan): an insight is raised only when its suggestion rounds above zero — a gap with nothing to do is not worth a line in the digest.
- Insights: last `PRICE_WINDOW_DAYS = 90`, worst relative gap first, at most 3, ids `price-rate:<serviceId>:<size|ANY>` and `price-breed:<serviceId>:<size|ANY>:<breedKey>`, `href: "/admin/services"`.
- Every surface says "list prices before discounts". No copy on existing screens changes.
- Other people edit this working tree. Commit **only your own hunks**: for a file with someone else's uncommitted edits, stage a blob of `HEAD` + your change (`git hash-object -w` + `git update-index --cacheinfo`). CLAUDE.md is git-ignored — edit it, never commit it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Database checks run against `gentlegroomer_test` only.

## Review Focus

1. A line with no price ("price on request") must not make a service look underpriced: the whole visit is left out. Pinned in Task 1 ("leaves out a visit with an unpriced line").
2. A visit whose stages were all clicked through (`workedMins` 0) must not divide by zero or read as infinite money. Pinned in Task 1 ("leaves out a visit with no hands-on minutes").
3. The same breed typed with different case and spacing must be one group, and a guide match must win over the typed text. Pinned in Task 1 (`breedGroup` tests).
4. Renaming a service must not un-snooze its insight: ids carry the service id, not its name. Pinned in Task 1 ("ids carry the service id").
5. A shop with nothing measured must show no section and no insight, not `$0/hr`. Pinned in Task 1 (`rateCents([])` null; `shopVisits` 0) and Task 3's `shopVisits > 0` guard.

---

### Task 1: The arithmetic — `lib/money-per-minute.ts`

**Files:**
- Create: `lib/money-per-minute.ts`
- Test: `lib/money-per-minute.test.ts`

**Interfaces:**
- Consumes: `median()` from `lib/rhythm.ts`; `formatCents`, `PRICE_STEP_CENTS` from `lib/pricing.ts`; `sizeName`, `PetSize` from `lib/pet-size.ts`; type `Insight` from `lib/insights.ts`.
- Produces:
  - `MIN_VISITS_FOR_PRICE = 5`, `PRICE_WINDOW_DAYS = 90`
  - `interface PricedLine { serviceId: string | null; serviceName: string | null; sizeTier: PetSize | null; sizePriced: boolean; priceCents: number | null }`
  - `interface PricedVisit { workedMins: number; ticketCents: number; lines: PricedLine[]; breedKey: string | null; breedLabel: string | null }`
  - `interface PriceGroup { key: string; label: string; visits: number; rateCents: number | null; medianMins: number | null; medianTicketCents: number | null; suggestCents: number | null; gap: number | null; evidence: string }`
  - `interface PriceRow extends PriceGroup { serviceId: string; size: PetSize | null; breeds: PriceGroup[] }`
  - `interface MoneyPerHour { shopRateCents: number | null; shopVisits: number; rows: PriceRow[] }`
  - `rateCents(visits: PricedVisit[]): number | null`
  - `clearsGap(rateCents: number, benchmarkCents: number): boolean`
  - `suggestedExtraCents(benchmarkCents: number, medianMins: number, medianTicketCents: number): number | null`
  - `breedGroup(typed: string | null, guideName: string | null): { key: string; label: string } | null`
  - `moneyPerHour(visits: PricedVisit[], rangeDays: number): MoneyPerHour`
  - `priceInsights(summary: MoneyPerHour): Insight[]`

- [ ] **Step 1: Write the failing test**

Create `lib/money-per-minute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  breedGroup,
  clearsGap,
  moneyPerHour,
  priceInsights,
  rateCents,
  suggestedExtraCents,
  type PricedLine,
  type PricedVisit,
} from "./money-per-minute";

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  serviceId: "groom",
  serviceName: "Full groom",
  sizeTier: "LARGE",
  sizePriced: true,
  priceCents: 8000,
  ...over,
});

const visit = (dollars: number, mins: number, over: Partial<PricedVisit> = {}): PricedVisit => ({
  workedMins: mins,
  ticketCents: dollars * 100,
  lines: [line()],
  breedKey: null,
  breedLabel: null,
  ...over,
});

const times = (count: number, make: () => PricedVisit) => Array.from({ length: count }, make);

describe("rateCents", () => {
  it("is total ticket over total hours, in whole dollars", () => {
    expect(rateCents([visit(60, 60), visit(30, 60)])).toBe(4500);
    // $120 in 130 minutes, not the average of $45/hr and $180/hr.
    expect(rateCents([visit(90, 120), visit(30, 10)])).toBe(5500);
  });

  it("is null with nothing measured", () => {
    expect(rateCents([])).toBeNull();
  });
});

describe("clearsGap", () => {
  it("needs both the share and the dollars", () => {
    expect(clearsGap(2400, 3000)).toBe(false); // 20% but $6/hr
    expect(clearsGap(10800, 12000)).toBe(false); // $12/hr but 10%
    expect(clearsGap(4800, 6000)).toBe(true); // 20% and $12/hr
  });
});

describe("suggestedExtraCents", () => {
  it("rounds the missing money to the $5 step", () => {
    // $71/hr for 140 min is $165.67; a typical $120 is $45.67 short.
    expect(suggestedExtraCents(7100, 140, 12000)).toBe(4500);
  });

  it("suggests nothing when the gap rounds to nothing or less", () => {
    expect(suggestedExtraCents(6000, 60, 5900)).toBeNull();
    expect(suggestedExtraCents(6000, 60, 7000)).toBeNull();
  });
});

describe("breedGroup", () => {
  it("folds case and spacing in what was typed", () => {
    expect(breedGroup(" Golden  Doodle ", null)).toEqual({ key: "golden doodle", label: "Golden Doodle" });
  });

  it("prefers the shop's own guide", () => {
    expect(breedGroup("Toy Poodle", "Poodle")).toEqual({ key: "poodle", label: "Poodle" });
  });

  it("is nothing without a breed", () => {
    expect(breedGroup(null, null)).toBeNull();
    expect(breedGroup("   ", null)).toBeNull();
  });
});

describe("moneyPerHour", () => {
  it("counts a visit with add-ons toward the shop rate only", () => {
    const addOn = visit(200, 60, { lines: [line(), line({ serviceId: "teeth", serviceName: "Teeth" })] });
    const summary = moneyPerHour([...times(5, () => visit(60, 60)), addOn], 90);
    expect(summary.shopVisits).toBe(6);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].visits).toBe(5);
  });

  it("gives a flat service one row whatever the size says", () => {
    const nails = line({ serviceId: "nails", serviceName: "Nails", sizePriced: false, sizeTier: "XL" });
    const [row] = moneyPerHour(times(5, () => visit(20, 15, { lines: [nails] })), 90).rows;
    expect(row).toMatchObject({ key: "nails:ANY", label: "Nails", size: null });
  });

  it("leaves an unknown size and a deleted service out of the rows", () => {
    const summary = moneyPerHour(
      [
        visit(60, 60, { lines: [line({ sizeTier: null })] }),
        visit(60, 60, { lines: [line({ serviceId: null, serviceName: null, sizePriced: false })] }),
      ],
      90
    );
    expect(summary.shopVisits).toBe(2);
    expect(summary.rows).toHaveLength(0);
  });

  it("leaves out a visit with an unpriced line", () => {
    expect(moneyPerHour([visit(0, 60, { lines: [line({ priceCents: null })] })], 90).shopVisits).toBe(0);
  });

  it("leaves out a visit with no hands-on minutes", () => {
    const summary = moneyPerHour([visit(60, 0)], 90);
    expect(summary.shopVisits).toBe(0);
    expect(summary.shopRateCents).toBeNull();
  });

  it("claims no rate below five visits", () => {
    const [row] = moneyPerHour(times(4, () => visit(60, 60)), 90).rows;
    expect(row.rateCents).toBeNull();
    expect(row.evidence).toBe("4 measured, 5 needed");
  });
});

describe("priceInsights", () => {
  it("measures a row against the shop rate and suggests the price", () => {
    const xl = line({ sizeTier: "XL" });
    const bath = line({ serviceId: "bath", serviceName: "Bath", sizeTier: "SMALL" });
    const summary = moneyPerHour(
      [...times(5, () => visit(52, 60, { lines: [xl] })), ...times(5, () => visit(80, 60, { lines: [bath] }))],
      90
    );
    expect(summary.shopRateCents).toBe(6600);
    const insights = priceInsights(summary);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      id: "price-rate:groom:XL",
      tone: "opportunity",
      title: "Full groom, XL earns $52/hr against the shop's $66/hr",
      detail: "At the shop rate the time is worth about $67 against a typical $52 today — about $15 more.",
      evidence: "Median 60 min hands-on, 5 visits, last 90 days. List prices before discounts.",
      href: "/admin/services",
    });
  });

  it("ids carry the service id, not its name", () => {
    const renamed = line({ sizeTier: "XL", serviceName: "Full groom (new)" });
    const bath = line({ serviceId: "bath", serviceName: "Bath", sizeTier: "SMALL" });
    const summary = moneyPerHour(
      [...times(5, () => visit(52, 60, { lines: [renamed] })), ...times(5, () => visit(80, 60, { lines: [bath] }))],
      90
    );
    expect(priceInsights(summary)[0].id).toBe("price-rate:groom:XL");
  });

  it("measures a breed against its own row, not the shop", () => {
    const doodle = { breedKey: "goldendoodle", breedLabel: "Goldendoodle" };
    const lab = { breedKey: "labrador retriever", breedLabel: "Labrador Retriever" };
    const summary = moneyPerHour([...times(5, () => visit(48, 60, doodle)), ...times(5, () => visit(84, 60, lab))], 90);
    expect(summary.rows[0].rateCents).toBe(6600);
    expect(summary.rows[0].gap).toBeNull();
    expect(priceInsights(summary)).toEqual([
      expect.objectContaining({
        id: "price-breed:groom:LARGE:goldendoodle",
        title: "Goldendoodle on Full groom, Large earn $48/hr against $66/hr for the size",
        detail: "About $20 more per visit would bring them level.",
      }),
    ]);
  });

  it("judges no breed while its row is under five visits", () => {
    const doodle = { breedKey: "goldendoodle", breedLabel: "Goldendoodle" };
    const summary = moneyPerHour(times(4, () => visit(48, 60, doodle)), 90);
    expect(summary.rows[0].breeds).toEqual([]);
  });

  it("keeps the three worst, worst first", () => {
    const row = (id: string, dollars: number) =>
      times(5, () => visit(dollars, 60, { lines: [line({ serviceId: id, serviceName: id, sizeTier: "SMALL" })] }));
    const summary = moneyPerHour([...row("a", 40), ...row("b", 44), ...row("c", 48), ...row("d", 36), ...row("e", 150)], 90);
    expect(summary.shopRateCents).toBe(6400);
    expect(priceInsights(summary).map((insight) => insight.id)).toEqual([
      "price-rate:d:SMALL",
      "price-rate:a:SMALL",
      "price-rate:b:SMALL",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/money-per-minute.test.ts`
Expected: FAIL — `Failed to resolve import "./money-per-minute"`.

- [ ] **Step 3: Write the implementation**

Create `lib/money-per-minute.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/money-per-minute.test.ts`
Expected: PASS — 21 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add lib/money-per-minute.ts lib/money-per-minute.test.ts
git commit -m "feat(pricing): what an hour of the shop's time earns, by service, size and breed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The queried half, and the shop insights

**Files:**
- Create: `lib/money-per-minute-queries.ts`
- Modify: `lib/insights.ts` (imports; the `Promise.all` in `shopInsights()`; one `push` before the snooze filter)
- Scripted check (scratchpad, not committed): `money-check.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `FINISHED_STATUSES` (`lib/analytics.ts`); `guidesForBreeds()` (`lib/breeds.ts`, returns `Map<trimmed-lowercase-breed, BreedGuide>`); `isSizePriced()` (`lib/pricing.ts`); `ticketFor()` (`lib/ticket.ts`); `visitTime()`, `workedMins()` (`lib/visit-time.ts`).
- Produces:
  - `pricedVisits(rangeDays: number, now?: Date): Promise<PricedVisit[]>`
  - `moneyPerHourSummary(rangeDays: number, now?: Date): Promise<MoneyPerHour>`
  - `priceInsightsNow(now?: Date): Promise<Insight[]>`

- [ ] **Step 1: Write the queried module**

Create `lib/money-per-minute-queries.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { guidesForBreeds } from "@/lib/breeds";
import type { Insight } from "@/lib/insights";
import {
  PRICE_WINDOW_DAYS,
  breedGroup,
  moneyPerHour,
  priceInsights,
  type MoneyPerHour,
  type PricedVisit,
} from "@/lib/money-per-minute";
import { isSizePriced } from "@/lib/pricing";
import { ticketFor } from "@/lib/ticket";
import { visitTime, workedMins } from "@/lib/visit-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Finished visits in the window as the pure half wants them. One query — the
 * history, lines, surcharges and breed ride along — and one breed-guide lookup
 * for every breed at once.
 */
export async function pricedVisits(rangeDays: number, now: Date = new Date()): Promise<PricedVisit[]> {
  const since = new Date(now.getTime() - rangeDays * DAY_MS);
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now } },
    select: {
      statusHistory: { select: { status: true, changedAt: true } },
      services: {
        select: {
          priceCents: true,
          sizeTier: true,
          service: {
            select: {
              id: true,
              name: true,
              priceSmallCents: true,
              priceMediumCents: true,
              priceLargeCents: true,
              priceXlCents: true,
              priceFlatCents: true,
              priceMaxCents: true,
            },
          },
        },
      },
      appointmentSurcharges: { select: { amountCents: true } },
      pet: { select: { breed: true } },
    },
  });

  const guides = await guidesForBreeds(visits.map((visit) => visit.pet.breed));

  return visits.flatMap((visit): PricedVisit[] => {
    const worked = workedMins(visitTime(visit.statusHistory, now));
    if (worked == null) return [];
    // Before discounts, and never the tip: see lib/money-per-minute.ts.
    const ticket = ticketFor({
      services: visit.services,
      surcharges: visit.appointmentSurcharges,
      tierDiscountCents: 0,
      rewardDiscountCents: 0,
      payments: [],
    });
    const guide = visit.pet.breed ? guides.get(visit.pet.breed.trim().toLowerCase()) : undefined;
    const breed = breedGroup(visit.pet.breed, guide?.breed ?? null);
    return [
      {
        workedMins: worked,
        ticketCents: ticket.serviceCents + ticket.surchargeCents,
        lines: visit.services.map((line) => ({
          serviceId: line.service?.id ?? null,
          serviceName: line.service?.name ?? null,
          sizeTier: line.sizeTier,
          sizePriced: line.service ? isSizePriced(line.service) : false,
          priceCents: line.priceCents,
        })),
        breedKey: breed?.key ?? null,
        breedLabel: breed?.label ?? null,
      },
    ];
  });
}

export async function moneyPerHourSummary(rangeDays: number, now: Date = new Date()): Promise<MoneyPerHour> {
  return moneyPerHour(await pricedVisits(rangeDays, now), rangeDays);
}

export async function priceInsightsNow(now: Date = new Date()): Promise<Insight[]> {
  return priceInsights(await moneyPerHourSummary(PRICE_WINDOW_DAYS, now));
}
```

- [ ] **Step 2: Wire it into `shopInsights()`**

Check first: `git diff --stat lib/insights.ts`. If it shows someone else's hunks, make the same edit to a copy of `git show HEAD:lib/insights.ts` for the commit blob and leave theirs unstaged.

In `lib/insights.ts`, after `import { demandForecast } from "@/lib/demand";` add:

```ts
import { priceInsightsNow } from "@/lib/money-per-minute-queries";
```

Change the destructuring line

```ts
  const [dueCustomers, noShowRisk, forecast, attachments, hours, walkInShare, anomalies, demand] =
```

to

```ts
  const [dueCustomers, noShowRisk, forecast, attachments, hours, walkInShare, anomalies, demand, pricing] =
```

and after the `demandForecast(),` element of the `Promise.all` array add:

```ts
    // Where an hour of the shop's time earns least against its price.
    priceInsightsNow(),
```

Then, immediately before the comment `// Last, over everything above: an observation somebody has already acted on`, add:

```ts
  insights.push(...pricing);

```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Scripted check against the test database**

Write `money-check.ts` in the session scratchpad (the same `.env.local` → `gentlegroomer_test` preamble as `summary-check.ts`):

```ts
import { readFileSync } from "node:fs";

const envLine = readFileSync("/Users/logan/Documents/gentlegroomer/.env.local", "utf8")
  .split("\n")
  .find((line) => line.startsWith("DATABASE_URL="))!;
const url = new URL(envLine.slice("DATABASE_URL=".length).replace(/^"|"$/g, ""));
url.pathname = "/gentlegroomer_test";
process.env.DATABASE_URL = url.toString();

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { moneyPerHourSummary, priceInsightsNow } = await import("@/lib/money-per-minute-queries");
  const summary = await moneyPerHourSummary(90);
  console.log("shop", summary.shopRateCents, "over", summary.shopVisits, "visits");
  for (const row of summary.rows) console.log(row.label, "|", row.rateCents, "|", row.suggestCents, "|", row.evidence);
  for (const insight of await priceInsightsNow()) console.log(insight.id, "|", insight.title, "|", insight.detail);
  await prisma.$disconnect();
}

main();
```

Run: `npx tsx <scratchpad>/money-check.ts`
Expected: a non-null shop rate over a positive visit count; one line per service × size, the ones under 5 visits reading "N measured, 5 needed"; zero to three insight lines, each id starting `price-rate:` or `price-breed:`. No exception.

- [ ] **Step 5: Run the lib tests and commit**

Run: `npx vitest run lib`
Expected: all pass.

```bash
git add lib/money-per-minute-queries.ts lib/insights.ts
git commit -m "feat(insights): the shop is told where an hour earns least, with a price

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Money per Hour on Analytics, and the docs

**Files:**
- Modify: `app/staff/analytics/page.tsx` (one import; the `Promise.all`; a section after Visit Time)
- Modify (not committed, git-ignored): `CLAUDE.md`

**Interfaces:**
- Consumes: `moneyPerHourSummary(rangeDays)` from Task 2; `MoneyPerHour`/`PriceRow` fields from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Load the summary**

Check first: `git diff --stat app/staff/analytics/page.tsx` — same blob rule as Task 2 if foreign hunks exist.

After `import { visitTimeSummary } from "@/lib/visit-time-queries";` add:

```ts
import { moneyPerHourSummary } from "@/lib/money-per-minute-queries";
```

Change

```ts
  const [shop, leaderboard, insights, config, comeback, visitTimes] = await Promise.all([
```

to

```ts
  const [shop, leaderboard, insights, config, comeback, visitTimes, perHour] = await Promise.all([
```

and after the `visitTimeSummary(rangeDays),` element add:

```ts
    moneyPerHourSummary(rangeDays),
```

- [ ] **Step 2: Render the section**

Immediately after the Visit Time section's closing `)}` (the line after its `</PageSection>`) and before `{/* Customers */}`, add:

```tsx
      {/* What an hour of the shop's time earns. Nothing measured, no band. */}
      {perHour.shopVisits > 0 && (
        <PageSection
          title="Money per Hour"
          hint={`Ticket per hands-on hour, last ${rangeDays} days · list prices before discounts`}
        >
          <p className="mb-3 text-sm text-stone-600">
            <span className="text-2xl font-black tabular-nums text-stone-900">
              {formatCents(perHour.shopRateCents)}/hr
            </span>{" "}
            across the shop · {perHour.shopVisits} visits ·{" "}
            <Link href="/admin/services" className="underline hover:text-stone-800">
              set prices
            </Link>
          </p>
          {perHour.rows.length > 0 && (
            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-well text-stone-500 text-[10px] tracking-tight">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Service</th>
                      <th scope="col" className="px-3 py-2 text-right">Rate</th>
                      <th scope="col" className="px-3 py-2 text-right">Hands-on</th>
                      <th scope="col" className="px-3 py-2 text-right">Ticket</th>
                      <th scope="col" className="px-3 py-2 text-right">Visits</th>
                      <th scope="col" className="px-3 py-2 text-right">Suggested</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {perHour.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2 font-semibold text-stone-900">{row.label}</td>
                        <td className="px-3 py-2 text-right font-bold text-stone-900 tabular-nums">
                          {row.rateCents == null ? "—" : `${formatCents(row.rateCents)}/hr`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.medianMins == null ? "—" : `${row.medianMins} min`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCents(row.medianTicketCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.rateCents == null ? (
                            <span className="text-[11px] text-stone-400">{row.evidence}</span>
                          ) : (
                            row.visits
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-stone-900 tabular-nums">
                          {row.suggestCents == null ? "" : `+${formatCents(row.suggestCents)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </PageSection>
      )}

```

- [ ] **Step 3: Document it in CLAUDE.md (git-ignored — do not commit)**

In CLAUDE.md, in the "An insight that acts" list, after the **Anomalies.** bullet, add:

```markdown
- **Money per hour.** [lib/money-per-minute.ts](lib/money-per-minute.ts) puts
  each visit's ticket *before discounts* (services plus surcharges, never the
  tip — a legacy rate is a price the shop agreed, not a price that is too low)
  against its hands-on minutes, weighted, grouped by service × size and by
  breed inside that. A visit with add-ons counts toward the shop rate only —
  its time cannot be split between its lines. A claim needs 5 visits and must
  clear **both** 15% and $10/hr below its benchmark: the shop rate for a row,
  the row's own rate for a breed. The suggestion is the benchmark times the
  median minutes less the median ticket, rounded with `Math.round` to $5 —
  never `roundToStep()`, which floors at $5 — and a gap that suggests nothing
  raises no insight. At most three reach `shopInsights()`; Analytics carries
  the table.
```

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: tsc exit 0; lint exit 0; every test passes except the known `app/seo-routes.test.ts` load failure ("cache is not a function"), which comes from someone else's uncommitted `app/sitemap.ts` and is not this plan's.

- [ ] **Step 5: Look at it**

Run `npm run dev:test` and open `/staff/analytics` signed in as a manager, if credentials are available. Expected: the Money per Hour section sits after Visit Time with a shop rate, a table, and "N measured, 5 needed" on thin rows. If no credentials are available, record a ruling and rely on Task 2's scripted check.

- [ ] **Step 6: Commit**

```bash
git add app/staff/analytics/page.tsx
git commit -m "feat(analytics): Money per Hour, service by size, with the price it would take

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
