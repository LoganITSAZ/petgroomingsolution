# Groomer–Pet Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record complaints and redos, judge each groomer per pet and breed on errors then speed, and use that to pick the booking groomer, steer the floor, warn the shop and show strengths on Analytics.

**Architecture:** One migration adds `COMPLAINT`/`REDO` event types and `Appointment.redoOfId`. A pure `lib/groomer-fit.ts` holds every rule (error causes, gate, speed, usual groomer, the booking pick, insights, strength rows); `lib/groomer-fit-queries.ts` loads 12 months of finished visits once and maps them to pure rows. Booking, the floor, `shopInsights()`, `petInsights()` and Analytics call it. Nothing is stored.

**Tech Stack:** Next 16 (params are Promises), TypeScript strict, Prisma 5.22 + PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-groomer-pet-fit-design.md`

## Global Constraints

- Window: last **12 months** (`FIT_WINDOW_DAYS = 365`) of finished (`FINISHED_STATUSES`) visits that are not redos.
- Error events: `COMPLAINT`, `REDO`, `INJURY`, `BITE`, `BEHAVIORAL`; a linked redo visit; a backward move against `STATUS_FLOW` with no `REWASH` event. Counted per visit.
- Gate: ≥ **3** visits at the level, ≥ **2** error visits, rate ≥ **2×** the shop's, rate ≥ **10 points** above the shop's. Shop rate is breed-level (guide × primary service type).
- Speed: ≥ **3** measured visits each; fastest median beats next fastest by both **15%** and **10 min**.
- Level: pet when ≥ 2 candidates have ≥ 3 visits on the pet; else breed (guide + service type); no guide and no pet level → no claim.
- Booking order: fit winner → typed preference (in candidates, not gated) → usual groomer (most of last **5**, ties to most recent; in candidates, not gated) → null.
- Shop insights: at most **3**, worst rate first, id `fit:<staffId>:<breedGuideId>:<serviceType>`.
- Work on `main` in the shared tree. Others have uncommitted edits: commit only your own hunks (stage a HEAD+yours blob via `git hash-object -w` + `git update-index --cacheinfo` for a file holding foreign hunks). Never commit `CLAUDE.md` (git-ignored).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No unrequested copy changes to existing strings. New strings only where this plan gives them.
- DB checks run against `gentlegroomer_test` only, never `gentlegroomer`.
- `app/seo-routes.test.ts` fails with "cache is not a function" because of someone else's uncommitted `app/sitemap.ts`. Not ours; leave it.

## Review Focus

1. **A redo that is cancelled or no-showed** — it must not count as an error or add minutes. Pinned in Task 4's DB check (the query filters `redos` by status).
2. **A visit nobody was assigned to** — credit falls to whoever moved it to finished; a visit with neither is dropped, not charged to `null`. Pinned in Task 4's DB check.
3. **A preferred groomer who has left (inactive) or is not on the floor** — never picked; falls through to the usual groomer. Pinned in Task 2 (`bookingGroomer` "preference not a candidate").
4. **A pet with no breed guide** — no breed claim, but the preference and usual groomer still work. Pinned in Task 2.
5. **A forged `redoOfId` posted for another pet's visit** — refused. Pinned in Task 5 (server-side check before `createAppointment`).

---

### Task 1: Schema, migration, event labels, complaint needs a note

**Files:**
- Modify: `prisma/schema.prisma` (enum `VisitEventType` ~line 1197; `model Appointment` ~line 933)
- Create: `prisma/migrations/20261007120000_groomer_fit/migration.sql`
- Modify: `app/staff/pets/[id]/page.tsx:33-51` (label and colour maps)
- Modify: `app/staff/appointments/actions.ts:400-445` (`logVisitEvent`), `app/staff/appointments/[id]/page.tsx` (`ERRORS` map ~line 120)

**Interfaces:**
- Produces: `VisitEventType.COMPLAINT`, `VisitEventType.REDO`; `Appointment.redoOfId: string | null`, relations `redoOf` / `redos` (relation name `"Redo"`).

`formatVisitEvent()` needs no entry: its `formatStatus` fallback already renders `COMPLAINT` as "Complaint" and `REDO` as "Redo".

- [ ] **Step 1: Labels on the pet page**

In `app/staff/pets/[id]/page.tsx`, add to `visitEventLabel`:

```ts
  COMPLAINT: "Complaint",
  REDO: "Redo",
```

and to `visitEventColor`:

```ts
  COMPLAINT: "bg-red-100 text-red-700",
  REDO: "bg-orange-100 text-orange-700",
```

- [ ] **Step 2: Schema**

In `enum VisitEventType`, after `OTHER`:

```prisma
  COMPLAINT // the owner complained about the groom; note says what
  REDO // a fix done at the counter, on the visit it fixes
```

In `model Appointment`, beside `staffId`:

```prisma
  redoOfId        String? // the visit this one redoes — always the root visit
```

beside the other relations:

```prisma
  redoOf        Appointment?               @relation("Redo", fields: [redoOfId], references: [id], onDelete: SetNull)
  redos         Appointment[]              @relation("Redo")
```

and beside the existing `@@index` lines:

```prisma
  @@index([redoOfId])
```

- [ ] **Step 3: Migration**

Create `prisma/migrations/20261007120000_groomer_fit/migration.sql`:

```sql
-- A complaint and a counter fix are logged on the visit they are about.
ALTER TYPE "VisitEventType" ADD VALUE 'COMPLAINT';
ALTER TYPE "VisitEventType" ADD VALUE 'REDO';

-- A redo that takes a slot points at the visit it redoes.
ALTER TABLE "appointments" ADD COLUMN "redoOfId" TEXT;
CREATE INDEX "appointments_redoOfId_idx" ON "appointments"("redoOfId");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_redoOfId_fkey"
  FOREIGN KEY ("redoOfId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Run: `npm run db:generate && npm run db:test:reset`
Expected: client generated; test DB rebuilt with every migration applied, including `20261007120000_groomer_fit`, no errors.

Then confirm the migration matches the schema:
Run: `DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres@localhost:5432/gentlegroomer_test}" npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`
Expected: exit 0, "No difference detected." (If the foreign uncommitted migration makes it differ elsewhere, the only diff lines must not mention `redoOfId` or `VisitEventType`.)

- [ ] **Step 4: A complaint needs a note**

In `logVisitEvent` (`app/staff/appointments/actions.ts`), directly after `const eventType = eventTypeRaw as VisitEventType;`:

```ts
  // A complaint with no words is a mark nobody can act on a week later.
  if (eventType === VisitEventType.COMPLAINT && !note) {
    back(appointmentId, "?error=complaint_note", returnTo(formData));
  }
```

In the `ERRORS` map of `app/staff/appointments/[id]/page.tsx`, after `bad_event`:

```ts
  complaint_note: "Say what the owner complained about.",
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

`actions.ts`, `[id]/page.tsx` and `schema.prisma` may carry foreign hunks — check `git diff HEAD <file>` and stage only yours (HEAD+yours blob).

```bash
git add prisma/migrations/20261007120000_groomer_fit "app/staff/pets/[id]/page.tsx"
# plus your hunks of prisma/schema.prisma, app/staff/appointments/actions.ts, app/staff/appointments/[id]/page.tsx
git commit -m "feat(visits): complaints and redos are recorded on the visit they are about

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pure rules — errors, gate, speed, usual groomer, the pick

**Files:**
- Modify: `lib/appointment-flow.ts:8` — export `STATUS_FLOW` (one word; file has foreign hunks)
- Create: `lib/groomer-fit.ts`
- Create: `lib/groomer-fit.test.ts`

**Interfaces:**
- Consumes: `STATUS_FLOW` from `lib/appointment-flow.ts`; `median`, `MIN_VISITS_FOR_PATTERN` from `lib/rhythm.ts`.
- Produces (exact):
  - constants `FIT_WINDOW_DAYS = 365`, `MIN_FIT_VISITS = 3`, `MIN_ERROR_VISITS = 2`, `ERROR_RATE_RATIO = 2`, `ERROR_RATE_POINTS = 0.1`, `SPEED_RATIO = 0.15`, `SPEED_MINS = 10`, `USUAL_GROOMER_VISITS = 5`, `MAX_FIT_INSIGHTS = 3`
  - `type ErrorCause = "COMPLAINT" | "REDO" | "INJURY" | "BITE" | "BEHAVIORAL" | "REDO_VISIT" | "SENT_BACK"`, `CAUSE_LABEL: Record<ErrorCause, string>`
  - `errorCauses(visit: { eventTypes: string[]; history: { status: string; changedAt: Date }[]; redoVisits: number }): ErrorCause[]`
  - `foldRedoMins(own: number | null, redos: (number | null)[]): number | null`
  - `interface FitSample { appointmentId: string; staffId: string; petId: string; guideId: string | null; guideName: string | null; serviceType: string; sizeTier: PetSize | null; coatType: string | null; finishedAt: Date; workedMins: number | null; errors: ErrorCause[] }`
  - `interface FitStats { visits: number; errorVisits: number; rate: number; measured: number; medianMins: number | null }`, `fitStats(samples: FitSample[]): FitStats`
  - `errorGate(groomer: FitStats, shop: FitStats | null): boolean`
  - `beats(fastMins: number, slowMins: number): boolean`
  - `speedWinner(entries: { staffId: string; stats: FitStats }[]): SpeedWin | null` with `SpeedWin { staffId; mins; visits; otherMins; otherVisits }`
  - `usualGroomer(petSamples: FitSample[]): { staffId: string; count: number; of: number } | null`
  - `interface FitQuestion { petId: string; guideId: string | null; serviceType: string; preferredStaffId: string | null; candidates: { id: string; name: string }[] }`
  - `interface GroomerPick { staffId: string; staffName: string; reason: string }`
  - `bookingGroomer(question: FitQuestion, samples: FitSample[]): GroomerPick | null`
  - `pct(rate: number): string` → `"4%"`

- [ ] **Step 1: Export the flow**

In `lib/appointment-flow.ts` change `const STATUS_FLOW: AppointmentStatus[] = [` to `export const STATUS_FLOW: AppointmentStatus[] = [`.

- [ ] **Step 2: Write the failing tests**

Create `lib/groomer-fit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bookingGroomer,
  errorCauses,
  errorGate,
  fitStats,
  foldRedoMins,
  speedWinner,
  usualGroomer,
  type FitQuestion,
  type FitSample,
} from "./groomer-fit";

const T0 = new Date("2026-06-01T15:00:00Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60_000);
let seq = 0;

function sample(over: Partial<FitSample> = {}): FitSample {
  seq += 1;
  return {
    appointmentId: `a${seq}`,
    staffId: "sam",
    petId: "bella",
    guideId: "doodle",
    guideName: "Goldendoodle",
    serviceType: "FULL_GROOM",
    sizeTier: "LARGE",
    coatType: "CURLY",
    finishedAt: new Date(T0.getTime() + seq * 86_400_000),
    workedMins: 60,
    errors: [],
    ...over,
  };
}
const many = (count: number, over: Partial<FitSample> = {}) =>
  Array.from({ length: count }, () => sample(over));

const STAFF = [
  { id: "sam", name: "Sam" },
  { id: "ana", name: "Ana" },
];
function question(over: Partial<FitQuestion> = {}): FitQuestion {
  return {
    petId: "bella",
    guideId: "doodle",
    serviceType: "FULL_GROOM",
    preferredStaffId: null,
    candidates: STAFF,
    ...over,
  };
}

describe("errorCauses", () => {
  const flow = (...statuses: string[]) =>
    statuses.map((status, index) => ({ status, changedAt: at(index * 10) }));

  it("counts each error event once, and a linked redo", () => {
    expect(
      errorCauses({ eventTypes: ["COMPLAINT", "COMPLAINT", "INJURY"], history: [], redoVisits: 1 }).sort()
    ).toEqual(["COMPLAINT", "INJURY", "REDO_VISIT"]);
    expect(errorCauses({ eventTypes: ["REDO", "BITE", "BEHAVIORAL"], history: [], redoVisits: 0 }).sort()).toEqual([
      "BEHAVIORAL",
      "BITE",
      "REDO",
    ]);
  });

  it("does not count what is not the groomer's doing", () => {
    expect(
      errorCauses({ eventTypes: ["REWASH", "MATTING_FOUND", "EQUIPMENT_ISSUE", "HEALTH_FINDING", "OTHER"], history: [], redoVisits: 0 })
    ).toEqual([]);
  });

  it("counts a pet sent back a stage", () => {
    const history = flow("CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING", "IN_PROGRESS", "FINISHING", "COMPLETE");
    expect(errorCauses({ eventTypes: [], history, redoVisits: 0 })).toEqual(["SENT_BACK"]);
  });

  it("lets a logged rewash explain the backward move", () => {
    const history = flow("CHECKED_IN", "IN_PROGRESS", "DRYING", "IN_PROGRESS", "DRYING", "COMPLETE");
    expect(errorCauses({ eventTypes: ["REWASH"], history, redoVisits: 0 })).toEqual([]);
  });

  it("reads the history in time order, not row order", () => {
    const history = [
      { status: "COMPLETE", changedAt: at(30) },
      { status: "CHECKED_IN", changedAt: at(0) },
      { status: "FINISHING", changedAt: at(20) },
    ];
    expect(errorCauses({ eventTypes: [], history, redoVisits: 0 })).toEqual([]);
  });
});

describe("foldRedoMins", () => {
  it("adds a redo's minutes to the original", () => {
    expect(foldRedoMins(60, [25])).toBe(85);
  });
  it("treats an unmeasured redo as nothing, and an unmeasured original as unmeasured", () => {
    expect(foldRedoMins(60, [null])).toBe(60);
    expect(foldRedoMins(null, [25])).toBeNull();
  });
});

describe("errorGate", () => {
  const shop = fitStats([...many(95), ...many(5, { errors: ["COMPLAINT"] })]); // 5%

  it("never gates on one error", () => {
    expect(errorGate(fitStats([...many(2), sample({ errors: ["BITE"] })]), shop)).toBe(false);
  });
  it("needs 2x the shop rate", () => {
    const high = fitStats([...many(80), ...many(20, { errors: ["COMPLAINT"] })]); // 20%
    expect(errorGate(fitStats([...many(18), ...many(2, { errors: ["INJURY"] })]), high)).toBe(false); // 10% < 40%
  });
  it("needs 10 points over the shop rate", () => {
    const low = fitStats([...many(97), ...many(3, { errors: ["COMPLAINT"] })]); // 3%
    expect(errorGate(fitStats([...many(23), ...many(2, { errors: ["INJURY"] })]), low)).toBe(false); // 8%: 2.7x but +5
  });
  it("gates when all three hold", () => {
    expect(errorGate(fitStats([...many(6), ...many(2, { errors: ["INJURY"] })]), shop)).toBe(true); // 25%
  });
  it("works against a shop rate of zero", () => {
    expect(errorGate(fitStats([...many(3), ...many(2, { errors: ["BITE"] })]), fitStats(many(50)))).toBe(true);
  });
  it("never gates under 3 visits, or with no baseline", () => {
    expect(errorGate(fitStats(many(2, { errors: ["BITE"] })), shop)).toBe(false);
    expect(errorGate(fitStats(many(5, { errors: ["BITE"] })), null)).toBe(false);
  });
});

describe("speedWinner", () => {
  const entry = (staffId: string, mins: number[]) => ({
    staffId,
    stats: fitStats(mins.map((workedMins) => sample({ staffId, workedMins }))),
  });

  it("needs both 15% and 10 minutes", () => {
    expect(speedWinner([entry("sam", [32, 32, 32]), entry("ana", [40, 40, 40])])).toBeNull(); // 20%, 8 min
    expect(speedWinner([entry("sam", [108, 108, 108]), entry("ana", [120, 120, 120])])).toBeNull(); // 12 min, 10%
    expect(speedWinner([entry("sam", [52, 52, 52]), entry("ana", [71, 71, 71])])).toMatchObject({
      staffId: "sam",
      mins: 52,
      otherMins: 71,
    });
  });
  it("needs 3 measured visits each, and a second groomer", () => {
    expect(speedWinner([entry("sam", [40, 40]), entry("ana", [90, 90, 90])])).toBeNull();
    expect(speedWinner([entry("sam", [40, 40, 40])])).toBeNull();
  });
  it("counts an unmeasured visit toward errors, not speed", () => {
    const stats = fitStats([sample({ workedMins: null, errors: ["BITE"] }), sample({ workedMins: 50 })]);
    expect(stats).toMatchObject({ visits: 2, errorVisits: 1, measured: 1, medianMins: 50 });
  });
});

describe("usualGroomer", () => {
  it("takes whoever did most of the last five", () => {
    const visits = [...many(3, { staffId: "ana" }), ...many(2, { staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "ana", count: 3, of: 5 });
  });
  it("only reads the last five", () => {
    const visits = [...many(4, { staffId: "ana" }), ...many(5, { staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "sam", count: 5, of: 5 });
  });
  it("breaks a tie toward the most recent", () => {
    const visits = [sample({ staffId: "ana" }), sample({ staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "sam", count: 1, of: 2 });
  });
  it("is null with no history", () => {
    expect(usualGroomer([])).toBeNull();
  });
});

describe("bookingGroomer", () => {
  it("picks the faster groomer on the breed over the owner's preference", () => {
    const samples = [...many(4, { staffId: "ana", workedMins: 52, petId: "x" }), ...many(6, { staffId: "sam", workedMins: 71, petId: "y" })];
    expect(bookingGroomer(question({ preferredStaffId: "sam" }), samples)).toEqual({
      staffId: "ana",
      staffName: "Ana",
      reason: "faster on this breed: 52 vs 71 min over 4 and 6 visits",
    });
  });

  it("uses the pet's own history when two groomers have 3 visits on it", () => {
    const samples = [
      ...many(3, { staffId: "ana", workedMins: 90 }),
      ...many(3, { staffId: "sam", workedMins: 60 }),
      // On other Doodles Ana is the faster one; the pet level must win.
      ...many(10, { staffId: "ana", workedMins: 40, petId: "other" }),
    ];
    expect(bookingGroomer(question(), samples)?.reason).toBe("faster on this pet: 60 vs 90 min over 3 and 3 visits");
  });

  it("falls back to the preference, then the usual groomer, then nobody", () => {
    expect(bookingGroomer(question({ preferredStaffId: "sam" }), [])).toMatchObject({ staffId: "sam", reason: "owner's preference" });
    const history = many(4, { staffId: "ana", petId: "bella", guideId: null });
    expect(bookingGroomer(question({ guideId: null }), history)).toMatchObject({ staffId: "ana", reason: "groomed 4 of last 4" });
    expect(bookingGroomer(question(), [])).toBeNull();
  });

  it("skips a preference who is not a candidate", () => {
    const history = many(2, { staffId: "ana" });
    expect(bookingGroomer(question({ preferredStaffId: "gone" }), history)).toMatchObject({ staffId: "ana" });
  });

  it("skips a gated preference and says why", () => {
    const samples = [
      ...many(3, { staffId: "sam", petId: "y" }),
      ...many(2, { staffId: "sam", petId: "y", errors: ["COMPLAINT"] }),
      ...many(40, { staffId: "ana", petId: "z" }),
      ...many(2, { staffId: "ana", petId: "bella" }),
    ];
    const pick = bookingGroomer(question({ preferredStaffId: "sam" }), samples);
    expect(pick?.staffId).toBe("ana");
    expect(pick?.reason).toBe("Sam skipped: 2 of 5 visits had an error, shop 4%; groomed 2 of last 2");
  });

  it("makes no breed claim without a guide, but still honours the preference", () => {
    const samples = [...many(4, { staffId: "ana", workedMins: 30, guideId: null, petId: "x" }), ...many(4, { staffId: "sam", workedMins: 90, guideId: null, petId: "y" })];
    expect(bookingGroomer(question({ guideId: null, preferredStaffId: "sam" }), samples)).toMatchObject({
      staffId: "sam",
      reason: "owner's preference",
    });
  });
});
```

- [ ] **Step 3: Run them**

Run: `npx vitest run lib/groomer-fit.test.ts`
Expected: FAIL — `Cannot find module './groomer-fit'` (or equivalent resolve error).

- [ ] **Step 4: Implement**

Create `lib/groomer-fit.ts`:

```ts
import { STATUS_FLOW } from "@/lib/appointment-flow";
import type { PetSize } from "@/lib/pet-size";
import { MIN_VISITS_FOR_PATTERN, median } from "@/lib/rhythm";

/**
 * Which groomer suits which pet, judged on the rows the shop already writes.
 *
 * Errors gate and speed ranks: a groomer whose error rate on this kind of dog
 * is clearly above the shop's is never the pick, however fast, and among the
 * rest the faster one wins only by a clear margin. There is no exchange rate
 * between minutes and mistakes. The owner's preferred groomer is a preference,
 * not a guarantee.
 *
 * Pure. The queried half is `lib/groomer-fit-queries.ts`.
 */

export const FIT_WINDOW_DAYS = 365;
export const MIN_FIT_VISITS = MIN_VISITS_FOR_PATTERN;
export const MIN_ERROR_VISITS = 2;
export const ERROR_RATE_RATIO = 2;
export const ERROR_RATE_POINTS = 0.1;
export const SPEED_RATIO = 0.15;
export const SPEED_MINS = 10;
export const USUAL_GROOMER_VISITS = 5;
export const MAX_FIT_INSIGHTS = 3;

export type ErrorCause = "COMPLAINT" | "REDO" | "INJURY" | "BITE" | "BEHAVIORAL" | "REDO_VISIT" | "SENT_BACK";

/** Logged events that count. A rewash, matting or a broken dryer is not the groomer's doing. */
const ERROR_EVENTS: readonly string[] = ["COMPLAINT", "REDO", "INJURY", "BITE", "BEHAVIORAL"];

export const CAUSE_LABEL: Record<ErrorCause, string> = {
  COMPLAINT: "complaint",
  REDO: "redo at the counter",
  INJURY: "injury",
  BITE: "bite",
  BEHAVIORAL: "behaviour",
  REDO_VISIT: "redo booked",
  SENT_BACK: "sent back a stage",
};

interface HistoryRow {
  status: string;
  changedAt: Date;
}

/** Did the pet move backward along the flow at any point? */
function sentBack(history: HistoryRow[]): boolean {
  const flow = STATUS_FLOW as readonly string[];
  let furthest = -1;
  for (const row of [...history].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())) {
    const index = flow.indexOf(row.status);
    if (index < 0) continue;
    if (index < furthest) return true;
    furthest = index;
  }
  return false;
}

/** Why a visit counts as an error visit; empty when it does not. */
export function errorCauses(visit: { eventTypes: string[]; history: HistoryRow[]; redoVisits: number }): ErrorCause[] {
  const causes = new Set<ErrorCause>();
  for (const type of visit.eventTypes) if (ERROR_EVENTS.includes(type)) causes.add(type as ErrorCause);
  if (visit.redoVisits > 0) causes.add("REDO_VISIT");
  // A logged rewash explains the trip back to the bath.
  if (!visit.eventTypes.includes("REWASH") && sentBack(visit.history)) causes.add("SENT_BACK");
  return Array.from(causes);
}

/** A redo's hands-on time belongs to the visit it fixes. */
export function foldRedoMins(own: number | null, redos: (number | null)[]): number | null {
  if (own == null) return null;
  return redos.reduce<number>((sum, mins) => sum + (mins ?? 0), own);
}

export interface FitSample {
  appointmentId: string;
  staffId: string;
  petId: string;
  guideId: string | null;
  guideName: string | null;
  serviceType: string;
  sizeTier: PetSize | null;
  coatType: string | null;
  finishedAt: Date;
  /** Hands-on minutes, redos included; null when unmeasured. */
  workedMins: number | null;
  errors: ErrorCause[];
}

export interface FitStats {
  visits: number;
  errorVisits: number;
  rate: number;
  measured: number;
  medianMins: number | null;
}

export function fitStats(samples: FitSample[]): FitStats {
  const mins = samples.flatMap((s) => (s.workedMins == null ? [] : [s.workedMins]));
  const errorVisits = samples.filter((s) => s.errors.length > 0).length;
  return {
    visits: samples.length,
    errorVisits,
    rate: samples.length > 0 ? errorVisits / samples.length : 0,
    measured: mins.length,
    medianMins: median(mins),
  };
}

export const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Clearly worse than the shop: two or more errors, twice the rate and ten points above it. */
export function errorGate(groomer: FitStats, shop: FitStats | null): boolean {
  if (!shop || groomer.visits < MIN_FIT_VISITS || groomer.errorVisits < MIN_ERROR_VISITS) return false;
  return (
    groomer.rate >= shop.rate * ERROR_RATE_RATIO &&
    // Float noise: 0.25 - 0.15 is 0.09999…
    groomer.rate - shop.rate >= ERROR_RATE_POINTS - 1e-9
  );
}

/** Faster by both margins, so neither a trivial nor a noisy gap decides anything. */
export function beats(fastMins: number, slowMins: number): boolean {
  const gap = slowMins - fastMins;
  return gap >= SPEED_MINS && gap / slowMins >= SPEED_RATIO;
}

export interface SpeedWin {
  staffId: string;
  mins: number;
  visits: number;
  otherMins: number;
  otherVisits: number;
}

export function speedWinner(entries: { staffId: string; stats: FitStats }[]): SpeedWin | null {
  const timed = entries
    .filter((e) => e.stats.measured >= MIN_FIT_VISITS && e.stats.medianMins != null)
    .sort((a, b) => (a.stats.medianMins as number) - (b.stats.medianMins as number));
  if (timed.length < 2) return null;
  const [best, next] = timed;
  const mins = best.stats.medianMins as number;
  const otherMins = next.stats.medianMins as number;
  if (!beats(mins, otherMins)) return null;
  return { staffId: best.staffId, mins, visits: best.stats.measured, otherMins, otherVisits: next.stats.measured };
}

/** Whoever did most of the pet's last five visits; a tie goes to the most recent. */
export function usualGroomer(petSamples: FitSample[]): { staffId: string; count: number; of: number } | null {
  const recent = [...petSamples]
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())
    .slice(0, USUAL_GROOMER_VISITS);
  if (recent.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of recent) counts.set(s.staffId, (counts.get(s.staffId) ?? 0) + 1);
  // Map keeps insertion order, and `recent` is newest first: the first to the
  // top count is the most recent of the tied.
  let best: string = recent[0].staffId;
  counts.forEach((count, staffId) => {
    if (count > (counts.get(best) as number)) best = staffId;
  });
  return { staffId: best, count: counts.get(best) as number, of: recent.length };
}

export interface FitQuestion {
  petId: string;
  guideId: string | null;
  serviceType: string;
  preferredStaffId: string | null;
  /** Who could take it: active groomers at booking, the ready people on the floor. */
  candidates: { id: string; name: string }[];
}

export interface GroomerPick {
  staffId: string;
  staffName: string;
  reason: string;
}

/** Fit, then the owner's preference, then the usual groomer, then nobody. */
export function bookingGroomer(question: FitQuestion, samples: FitSample[]): GroomerPick | null {
  const names = new Map(question.candidates.map((c) => [c.id, c.name]));
  const breed = question.guideId
    ? samples.filter((s) => s.guideId === question.guideId && s.serviceType === question.serviceType)
    : [];
  // One pet's history is too thin to be a baseline: the shop's rate is always the breed's.
  const shop = breed.length > 0 ? fitStats(breed) : null;
  const onPet = samples.filter((s) => s.petId === question.petId);
  const petLevel =
    question.candidates.filter((c) => onPet.filter((s) => s.staffId === c.id).length >= MIN_FIT_VISITS).length >= 2;
  const level = petLevel ? onPet : breed;
  const statsOf = (staffId: string) => fitStats(level.filter((s) => s.staffId === staffId));
  const gated = new Set(question.candidates.filter((c) => errorGate(statsOf(c.id), shop)).map((c) => c.id));

  const preferred =
    question.preferredStaffId && names.has(question.preferredStaffId) ? question.preferredStaffId : null;
  const usual = usualGroomer(onPet);
  const usualId = usual && names.has(usual.staffId) ? usual.staffId : null;

  const skipped = Array.from(new Set([preferred, usualId]))
    .filter((id): id is string => id != null && gated.has(id))
    .map((id) => {
      const stats = statsOf(id);
      return `${names.get(id)} skipped: ${stats.errorVisits} of ${stats.visits} visits had an error, shop ${pct(shop?.rate ?? 0)}`;
    });
  const pick = (staffId: string, why: string): GroomerPick => ({
    staffId,
    staffName: names.get(staffId) as string,
    reason: [...skipped, why].join("; "),
  });

  const win = speedWinner(
    question.candidates.filter((c) => !gated.has(c.id)).map((c) => ({ staffId: c.id, stats: statsOf(c.id) }))
  );
  if (win) {
    return pick(
      win.staffId,
      `faster on this ${petLevel ? "pet" : "breed"}: ${win.mins} vs ${win.otherMins} min over ${win.visits} and ${win.otherVisits} visits`
    );
  }
  if (preferred && !gated.has(preferred)) return pick(preferred, "owner's preference");
  if (usual && usualId && !gated.has(usualId)) return pick(usualId, `groomed ${usual.count} of last ${usual.of}`);
  return null;
}
```

- [ ] **Step 5: Run them**

Run: `npx vitest run lib/groomer-fit.test.ts lib/appointment-flow.test.ts`
Expected: PASS, all tests.

If the "skips a gated preference" case fails on the shop rate text: shop = 47 breed-level Doodle visits with 2 errors = 4%; Sam at breed level 5 visits, 2 errors = 40% ≥ 8% and ≥ +10 → gated. The pick falls to usual (Ana, 2 of last 2 on Bella). Fix the code, not the expectation, unless the arithmetic above is wrong — then ledger a ruling.

- [ ] **Step 6: Commit**

`lib/appointment-flow.ts` has foreign hunks — stage only the `export` hunk.

```bash
git add lib/groomer-fit.ts lib/groomer-fit.test.ts
# plus your one-line hunk of lib/appointment-flow.ts
git commit -m "feat(fit): judge a groomer for a pet on errors first, then speed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The pure readouts — shop insights and strength rows

**Files:**
- Modify: `lib/groomer-fit.ts`
- Modify: `lib/groomer-fit.test.ts`

**Interfaces:**
- Consumes: Task 2's `FitSample`, `fitStats`, `errorGate`, `beats`, `pct`, `CAUSE_LABEL`, `MAX_FIT_INSIGHTS`, `MIN_FIT_VISITS`.
- Produces:
  - `fitInsights(samples: FitSample[], names: Map<string, string>): Insight[]`
  - `type StrengthAxis = "breed" | "size" | "coat"`
  - `interface StrengthRow { key: string; staffName: string; group: string; visits: number; rate: number; shopRate: number; medianMins: number | null; shopMedianMins: number | null; flag: "strength" | "watch" | null }`
  - `strengthRows(samples: FitSample[], names: Map<string, string>, axis: StrengthAxis): StrengthRow[]`

- [ ] **Step 1: Write the failing tests**

Add `fitInsights, strengthRows` to the import in `lib/groomer-fit.test.ts`, then append:

```ts
describe("fitInsights", () => {
  const names = new Map([
    ["sam", "Sam"],
    ["ana", "Ana"],
    ["kim", "Kim"],
  ]);
  const shopBase = (guideId: string, guideName: string) => many(40, { staffId: "ana", guideId, guideName, petId: "p" });

  it("raises one warning per gated groomer, breed and service, with a stable id", () => {
    const samples = [
      ...shopBase("doodle", "Goldendoodle"),
      ...many(5, { staffId: "sam" }),
      sample({ staffId: "sam", errors: ["COMPLAINT"], finishedAt: new Date("2026-03-03T18:00:00Z") }),
      sample({ staffId: "sam", errors: ["REDO_VISIT", "INJURY"], finishedAt: new Date("2026-04-12T18:00:00Z") }),
    ];
    const [insight, ...rest] = fitInsights(samples, names);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: "fit:sam:doodle:FULL_GROOM",
      tone: "warning",
      title: "Sam: 2 of 7 Goldendoodle full groom visits had an error",
      evidence: "Mar 3: complaint · Apr 12: redo booked, injury · shop rate 4%, last 12 months", // 2 of 47
    });
  });

  it("keeps the worst three", () => {
    // Per guide: 3 clean + 2..5 bites — rates 2/5, 3/6, 4/7, 5/8, so d is worst.
    const samples = ["a", "b", "c", "d"].flatMap((guideId, g) => [
      ...many(40, { staffId: "zed", guideId, guideName: guideId }),
      ...many(3, { staffId: "sam", guideId, guideName: guideId }),
      ...many(2 + g, { staffId: "sam", guideId, guideName: guideId, errors: ["BITE"] }),
    ]);
    const insights = fitInsights(samples, new Map([...names, ["zed", "Zed"]]));
    expect(insights.map((i) => i.id)).toEqual(["fit:sam:d:FULL_GROOM", "fit:sam:c:FULL_GROOM", "fit:sam:b:FULL_GROOM"]);
  });

  it("says nothing about a pet with no breed guide", () => {
    expect(fitInsights(many(6, { staffId: "sam", guideId: null, errors: ["BITE"] }), names)).toEqual([]);
  });
});

describe("strengthRows", () => {
  const names = new Map([
    ["sam", "Sam"],
    ["ana", "Ana"],
  ]);

  it("flags a groomer faster than the shop with no worse error rate as a strength", () => {
    const samples = [...many(3, { staffId: "sam", workedMins: 40 }), ...many(9, { staffId: "ana", workedMins: 80 })];
    const rows = strengthRows(samples, names, "breed");
    expect(rows.find((r) => r.staffName === "Sam")).toMatchObject({ group: "Goldendoodle", visits: 3, medianMins: 40, shopMedianMins: 80, flag: "strength" });
    expect(rows.find((r) => r.staffName === "Ana")?.flag).toBeNull();
  });

  it("flags a gated groomer to watch", () => {
    const samples = [...many(30, { staffId: "ana" }), ...many(2, { staffId: "sam" }), ...many(2, { staffId: "sam", errors: ["BITE"] })];
    expect(strengthRows(samples, names, "breed").find((r) => r.staffName === "Sam")?.flag).toBe("watch");
  });

  it("groups by size and coat, and leaves out cells under three visits", () => {
    const samples = [...many(3, { staffId: "sam", sizeTier: "SMALL" }), ...many(2, { staffId: "ana", sizeTier: "SMALL" })];
    expect(strengthRows(samples, names, "size").map((r) => [r.staffName, r.group])).toEqual([["Sam", "Small"]]);
    expect(strengthRows(samples, names, "coat").map((r) => r.group)).toEqual(["Curly"]);
  });

  it("skips samples with no value for the axis", () => {
    expect(strengthRows(many(3, { coatType: null }), names, "coat")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run lib/groomer-fit.test.ts`
Expected: FAIL — `fitInsights is not a function` / not exported.

- [ ] **Step 3: Implement**

Add to `lib/groomer-fit.ts` imports:

```ts
import type { Insight } from "@/lib/insights";
import { sizeName } from "@/lib/pet-size";
import { formatCoatType, formatServiceType, formatShopDate } from "@/lib/utils";
```

(Merge with the existing `PetSize` type import: `import { sizeName, type PetSize } from "@/lib/pet-size";`.)

Append:

```ts
/** One warning per groomer, breed and service that fails the gate; the worst three. */
export function fitInsights(samples: FitSample[], names: Map<string, string>): Insight[] {
  const groups = new Map<string, FitSample[]>();
  for (const s of samples) {
    if (!s.guideId) continue;
    const key = `${s.guideId}:${s.serviceType}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const found: { rate: number; insight: Insight }[] = [];
  groups.forEach((group, key) => {
    const shop = fitStats(group);
    for (const staffId of Array.from(new Set(group.map((s) => s.staffId)))) {
      const mine = group.filter((s) => s.staffId === staffId);
      const stats = fitStats(mine);
      if (!errorGate(stats, shop)) continue;
      const { guideName, serviceType } = mine[0];
      const errors = mine
        .filter((s) => s.errors.length > 0)
        .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())
        .map((s) => `${formatShopDate(s.finishedAt, { month: "short", day: "numeric" })}: ${s.errors.map((c) => CAUSE_LABEL[c]).join(", ")}`);
      found.push({
        rate: stats.rate,
        insight: {
          id: `fit:${staffId}:${key}`,
          tone: "warning",
          title: `${names.get(staffId) ?? "A groomer"}: ${stats.errorVisits} of ${stats.visits} ${guideName} ${formatServiceType(serviceType).toLowerCase()} visits had an error`,
          detail: `New ${guideName} bookings go to someone else while this holds. Worth a look at what was logged.`,
          evidence: `${errors.join(" · ")} · shop rate ${pct(shop.rate)}, last 12 months`,
          href: "/staff/analytics",
        },
      });
    }
  });

  return found
    .sort((a, b) => b.rate - a.rate)
    .slice(0, MAX_FIT_INSIGHTS)
    .map((f) => f.insight);
}

export type StrengthAxis = "breed" | "size" | "coat";

export interface StrengthRow {
  key: string;
  staffName: string;
  group: string;
  visits: number;
  rate: number;
  shopRate: number;
  medianMins: number | null;
  shopMedianMins: number | null;
  flag: "strength" | "watch" | null;
}

function axisOf(s: FitSample, axis: StrengthAxis): { key: string; label: string } | null {
  if (axis === "breed") return s.guideId ? { key: s.guideId, label: s.guideName ?? s.guideId } : null;
  if (axis === "size") return s.sizeTier ? { key: s.sizeTier, label: sizeName(s.sizeTier) } : null;
  return s.coatType ? { key: s.coatType, label: formatCoatType(s.coatType) } : null;
}

/** Each groomer against the shop, per breed, size or coat. Cells under three visits are left out. */
export function strengthRows(samples: FitSample[], names: Map<string, string>, axis: StrengthAxis): StrengthRow[] {
  const groups = new Map<string, { label: string; samples: FitSample[] }>();
  for (const s of samples) {
    const g = axisOf(s, axis);
    if (!g) continue;
    const entry = groups.get(g.key) ?? { label: g.label, samples: [] };
    entry.samples.push(s);
    groups.set(g.key, entry);
  }

  const rows: StrengthRow[] = [];
  groups.forEach(({ label, samples: group }, groupKey) => {
    const shop = fitStats(group);
    for (const staffId of Array.from(new Set(group.map((s) => s.staffId)))) {
      const stats = fitStats(group.filter((s) => s.staffId === staffId));
      if (stats.visits < MIN_FIT_VISITS) continue;
      const faster =
        stats.measured >= MIN_FIT_VISITS &&
        stats.medianMins != null &&
        shop.medianMins != null &&
        beats(stats.medianMins, shop.medianMins);
      rows.push({
        key: `${groupKey}:${staffId}`,
        staffName: names.get(staffId) ?? "Former staff",
        group: label,
        visits: stats.visits,
        rate: stats.rate,
        shopRate: shop.rate,
        medianMins: stats.medianMins,
        shopMedianMins: shop.medianMins,
        flag: errorGate(stats, shop) ? "watch" : faster && stats.rate <= shop.rate ? "strength" : null,
      });
    }
  });

  return rows.sort((a, b) => a.group.localeCompare(b.group) || a.staffName.localeCompare(b.staffName));
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run lib/groomer-fit.test.ts`
Expected: PASS. The evidence date format depends on `formatShopDate` with `{ month: "short", day: "numeric" }` in `America/Phoenix`: `2026-03-03T18:00:00Z` → "Mar 3".

- [ ] **Step 5: Commit**

```bash
git add lib/groomer-fit.ts lib/groomer-fit.test.ts
git commit -m "feat(fit): warn where a groomer's errors run high, and tabulate strengths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The queried half, and redos folded into money per minute

**Files:**
- Create: `lib/groomer-fit-queries.ts`
- Modify: `lib/money-per-minute-queries.ts:24-84` (`pricedVisits`)
- Create (scratch, not committed): `<scratchpad>/fit-check.ts`

**Interfaces:**
- Consumes: Task 2/3 exports; `guidesForBreeds` (`lib/breeds.ts`), `FINISHED_STATUSES` (`lib/analytics.ts`), `visitTime`, `workedMins` (`lib/visit-time.ts`).
- Produces:
  - `fitSamples(now?: Date): Promise<FitSample[]>`
  - `guideIdFor(guides: Map<string, BreedGuide>, breed: string | null): string | null`
  - `activeGroomers(): Promise<{ id: string; name: string }[]>`
  - `bookingGroomerFor(petId: string, serviceType: string, now?: Date): Promise<GroomerPick | null>`
  - `fitInsightsNow(now?: Date): Promise<Insight[]>`
  - `petFitInsights(petId: string, now?: Date): Promise<Insight[]>`
  - `groomerStrengths(now?: Date): Promise<Record<StrengthAxis, StrengthRow[]>>`

- [ ] **Step 1: Write the queries**

Create `lib/groomer-fit-queries.ts`:

```ts
import { AppointmentStatus, StaffRole, type BreedGuide } from "@prisma/client";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { guidesForBreeds } from "@/lib/breeds";
import {
  FIT_WINDOW_DAYS,
  bookingGroomer,
  errorCauses,
  fitInsights,
  foldRedoMins,
  strengthRows,
  type FitSample,
  type GroomerPick,
  type StrengthAxis,
  type StrengthRow,
} from "@/lib/groomer-fit";
import type { Insight } from "@/lib/insights";
import { prisma } from "@/lib/prisma";
import { visitTime, workedMins } from "@/lib/visit-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A redo the shop cancelled, or the owner never brought in, fixed nothing and cost nothing. */
const LIVE_REDO = { status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } };

export function guideIdFor(guides: Map<string, BreedGuide>, breed: string | null): string | null {
  return breed ? (guides.get(breed.trim().toLowerCase())?.id ?? null) : null;
}

/**
 * The window's finished visits as the pure half wants them. One query and one
 * breed-guide lookup. A redo is never a sample: its minutes and its error
 * belong to the visit it fixes.
 */
// ponytail: loads 12 months on every booking and dashboard load; cache per request if it shows up in timings.
export async function fitSamples(now: Date = new Date()): Promise<FitSample[]> {
  const since = new Date(now.getTime() - FIT_WINDOW_DAYS * DAY_MS);
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now }, redoOfId: null },
    select: {
      id: true,
      petId: true,
      staffId: true,
      serviceType: true,
      scheduledAt: true,
      completedAt: true,
      statusHistory: { select: { status: true, changedAt: true, changedById: true }, orderBy: { changedAt: "asc" } },
      visitEvents: { select: { eventType: true } },
      redos: { where: LIVE_REDO, select: { statusHistory: { select: { status: true, changedAt: true } } } },
      services: { select: { sizeTier: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      pet: { select: { breed: true, coatType: true } },
    },
  });
  const guides = await guidesForBreeds(visits.map((visit) => visit.pet.breed));

  return visits.flatMap((visit): FitSample[] => {
    // Same credit rule as Analytics: the assigned groomer, else whoever finished it.
    const finish = visit.statusHistory.find((row) => FINISHED_STATUSES.includes(row.status));
    const staffId = visit.staffId ?? finish?.changedById ?? null;
    if (!staffId) return [];
    const guide = visit.pet.breed ? guides.get(visit.pet.breed.trim().toLowerCase()) : undefined;
    return [
      {
        appointmentId: visit.id,
        staffId,
        petId: visit.petId,
        guideId: guide?.id ?? null,
        guideName: guide?.breed ?? null,
        serviceType: visit.serviceType,
        sizeTier: visit.services[0]?.sizeTier ?? null,
        coatType: visit.pet.coatType,
        finishedAt: visit.completedAt ?? finish?.changedAt ?? visit.scheduledAt,
        workedMins: foldRedoMins(
          workedMins(visitTime(visit.statusHistory, now)),
          visit.redos.map((redo) => workedMins(visitTime(redo.statusHistory, now)))
        ),
        errors: errorCauses({
          eventTypes: visit.visitEvents.map((event) => event.eventType),
          history: visit.statusHistory,
          redoVisits: visit.redos.length,
        }),
      },
    ];
  });
}

/** Who a booking may go to — the same people the assignment dropdowns offer. */
export async function activeGroomers(): Promise<{ id: string; name: string }[]> {
  return prisma.staff.findMany({
    where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
    select: { id: true, name: true },
  });
}

export async function bookingGroomerFor(petId: string, serviceType: string, now: Date = new Date()): Promise<GroomerPick | null> {
  const [pet, candidates, samples] = await Promise.all([
    prisma.pet.findUnique({
      where: { id: petId },
      select: { breed: true, customer: { select: { preferredStaffId: true } } },
    }),
    activeGroomers(),
    fitSamples(now),
  ]);
  if (!pet) return null;
  const guides = await guidesForBreeds([pet.breed]);
  return bookingGroomer(
    {
      petId,
      guideId: guideIdFor(guides, pet.breed),
      serviceType,
      preferredStaffId: pet.customer.preferredStaffId,
      candidates,
    },
    samples
  );
}

/** Insights about people who still work here. */
export async function fitInsightsNow(now: Date = new Date()): Promise<Insight[]> {
  const [samples, staff] = await Promise.all([fitSamples(now), activeGroomers()]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return fitInsights(samples.filter((s) => names.has(s.staffId)), names);
}

/** Only when the evidence names somebody other than the owner's choice. */
export async function petFitInsights(petId: string, now: Date = new Date()): Promise<Insight[]> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: {
      name: true,
      customer: { select: { preferredStaff: { select: { id: true, name: true } } } },
      appointments: {
        where: { status: { in: FINISHED_STATUSES } },
        orderBy: { scheduledAt: "desc" },
        take: 1,
        select: { serviceType: true },
      },
    },
  });
  const preferred = pet?.customer.preferredStaff;
  const serviceType = pet?.appointments[0]?.serviceType;
  if (!pet || !preferred || !serviceType) return [];

  const pick = await bookingGroomerFor(petId, serviceType, now);
  if (!pick || pick.staffId === preferred.id) return [];
  return [
    {
      id: `pet-fit:${petId}`,
      tone: "opportunity",
      title: `${pick.staffName} is the better fit for ${pet.name}`,
      detail: `The owner prefers ${preferred.name}. New bookings go to ${pick.staffName} unless staff choose otherwise.`,
      evidence: pick.reason,
    },
  ];
}

export async function groomerStrengths(now: Date = new Date()): Promise<Record<StrengthAxis, StrengthRow[]>> {
  const [samples, staff] = await Promise.all([fitSamples(now), activeGroomers()]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const mine = samples.filter((s) => names.has(s.staffId));
  return {
    breed: strengthRows(mine, names, "breed"),
    size: strengthRows(mine, names, "size"),
    coat: strengthRows(mine, names, "coat"),
  };
}
```

- [ ] **Step 2: Fold redos into money per minute**

In `lib/money-per-minute-queries.ts`:
- add `import { foldRedoMins } from "@/lib/groomer-fit";`
- `where` becomes `{ status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now }, redoOfId: null }`
- add to `select`:

```ts
      // A redo is not a cheap visit: its time belongs to the one it fixes.
      redos: {
        where: { status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } },
        select: { statusHistory: { select: { status: true, changedAt: true } } },
      },
```

  with `import { AppointmentStatus } from "@prisma/client";`
- replace `const worked = workedMins(visitTime(visit.statusHistory, now));` with:

```ts
    const worked = foldRedoMins(
      workedMins(visitTime(visit.statusHistory, now)),
      visit.redos.map((redo) => workedMins(visitTime(redo.statusHistory, now)))
    );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: DB check against the test database**

Write `<scratchpad>/fit-check.ts` (scratchpad is outside the repo; run from repo root so `@/` resolves through tsx's tsconfig paths — if it does not, copy it to `scripts/fit-check.tmp.ts`, run, and delete):

```ts
import { prisma } from "@/lib/prisma";
import { fitSamples } from "@/lib/groomer-fit-queries";
import { pricedVisits } from "@/lib/money-per-minute-queries";

async function main() {
  const original = await prisma.appointment.findFirst({
    where: { status: "PICKED_UP", staffId: { not: null }, statusHistory: { some: { status: "FINISHING" } } },
    select: { id: true, petId: true, customerId: true, serviceType: true, staffId: true, scheduledAt: true },
    orderBy: { scheduledAt: "desc" },
  });
  if (!original) throw new Error("no finished demo visit");
  const t = original.scheduledAt.getTime() + 2 * 86_400_000;
  const mk = (status: string) =>
    prisma.appointment.create({
      data: {
        customerId: original.customerId, petId: original.petId, serviceType: original.serviceType,
        scheduledAt: new Date(t), status: status as never, redoOfId: original.id,
        statusHistory: { create: [
          { status: "IN_PROGRESS", changedAt: new Date(t) },
          { status: "FINISHING", changedAt: new Date(t + 10 * 60_000) },
          { status: "COMPLETE", changedAt: new Date(t + 30 * 60_000) },
        ] },
      },
    });
  const live = await mk("PICKED_UP");
  const dead = await mk("CANCELLED");
  const unassigned = await prisma.appointment.create({
    data: { customerId: original.customerId, petId: original.petId, serviceType: original.serviceType, scheduledAt: new Date(t - 86_400_000), status: "PICKED_UP" },
  });

  const samples = await fitSamples();
  const s = samples.find((x) => x.appointmentId === original.id);
  console.log("errors", s?.errors, "mins", s?.workedMins);
  console.log("redo is a sample?", samples.some((x) => x.appointmentId === live.id));
  console.log("unassigned is a sample?", samples.some((x) => x.appointmentId === unassigned.id));
  console.log("priced count", (await pricedVisits(365)).length);

  await prisma.appointment.deleteMany({ where: { id: { in: [live.id, dead.id, unassigned.id] } } });
}
main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres@localhost:5432/gentlegroomer_test}" npx tsx <scratchpad>/fit-check.ts`
Expected:
- `errors` includes `"REDO_VISIT"` (once, from the live redo — the cancelled one adds nothing);
- `mins` is the original's hands-on minutes plus 30 (the live redo's bath + table), not plus 60;
- `redo is a sample? false`;
- `unassigned is a sample? false` (no `staffId`, no finishing history row with a `changedById`).

- [ ] **Step 5: Run the money-per-minute tests**

Run: `npx vitest run lib/money-per-minute.test.ts lib/groomer-fit.test.ts`
Expected: PASS (the fold is tested in `groomer-fit.test.ts`'s `foldRedoMins`; the query change is checked in Step 4).

- [ ] **Step 6: Commit**

```bash
git add lib/groomer-fit-queries.ts lib/money-per-minute-queries.ts
git commit -m "feat(fit): load a year of grooms once; a redo's time counts on the visit it fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Booking — the derived groomer and "Book a redo"

**Precondition — check first.** `lib/create-appointment.ts` line ~220 (`preferredGroomer(input.customerId)`) and `lib/stations.ts` `preferredGroomer()` sit inside **someone else's uncommitted hunks** (they replaced `defaultAssignment`). Run `git diff HEAD lib/create-appointment.ts lib/stations.ts`. If those hunks are still uncommitted, **stop and ask the user** whether to wait for them to land or commit on top of them; do not commit their work under this plan.

**Files:**
- Modify: `lib/create-appointment.ts` (input type ~line 48; assignment ~line 216; history note ~line 270; `create` data)
- Modify: `lib/stations.ts` — delete `preferredGroomer()` (its only caller moves to `bookingGroomerFor`)
- Modify: `app/staff/appointments/new/page.tsx`
- Modify: `app/staff/appointments/[id]/page.tsx` (a "Book a redo" link)

**Interfaces:**
- Consumes: `bookingGroomerFor(petId, serviceType)` from Task 4.
- Produces: `CreateAppointmentInput.redoOfId?: string | null`.

- [ ] **Step 1: createAppointment derives through fit**

In `lib/create-appointment.ts`:
- replace `import { preferredGroomer } from "@/lib/stations";` with `import { bookingGroomerFor } from "@/lib/groomer-fit-queries";`
- in `CreateAppointmentInput` add after `staffId`:

```ts
  /** The visit this one redoes — always the root visit. */
  redoOfId?: string | null;
```

- replace the staff derivation:

```ts
  // Bookings do not ask for a groomer: the best fit for this pet takes it,
  // else the owner's preference, else whoever usually grooms it. The station
  // is never derived — a pet is placed when it arrives, and one with nowhere
  // to stand waits in a kennel. An explicit value still wins.
  const pick = input.staffId === undefined ? await bookingGroomerFor(input.petId, serviceType) : null;
  const staffId = input.staffId === undefined ? (pick?.staffId ?? null) : input.staffId;
  const stationId = input.stationId ?? null;
```

- in `tx.appointment.create` `data`, after `staffId: assignment.staffId,`: `redoOfId: input.redoOfId ?? null,`
- the history note becomes:

```ts
        note: [input.note ?? "Appointment created", slot.reason, pick ? `Groomer: ${pick.staffName}, ${pick.reason}.` : null]
          .filter(Boolean)
          .join(" "),
```

Delete `preferredGroomer()` and its doc comment from `lib/stations.ts`. Run `grep -rn "preferredGroomer" lib app components` — expected: no matches.

- [ ] **Step 2: Book a redo on the visit screen**

In `app/staff/appointments/[id]/page.tsx`, inside the "What happened" `<section>`, directly after the `</form>` of the event form, add (the page already imports `Link` — if not, import it from `next/link`; `FINISHED_STATUSES` from `@/lib/analytics`):

```tsx
          {FINISHED_STATUSES.includes(appointment.status) && (
            <p className="mt-3 border-t border-stone-100 pt-3 text-sm">
              <Link
                href={`/staff/appointments/new?customerId=${appointment.customerId}&petId=${appointment.petId}&redoOf=${appointment.redoOfId ?? appointment.id}`}
                className="font-semibold text-stone-800 underline hover:text-stone-900"
              >
                Book a redo
              </Link>
              <span className="block text-xs text-stone-400">
                For a fix that needs its own slot. Its time counts against this visit.
              </span>
            </p>
          )}
```

(A redo of a redo links to the root visit, so the chain stays one level deep.)

- [ ] **Step 3: The new-appointment page carries it**

In `app/staff/appointments/new/page.tsx`:
- `searchParams: Promise<{ customerId?: string; petId?: string; redoOf?: string }>;`
- after `const { customerId, petId } = searchParams;` load the original:

```ts
  const redoOf = searchParams.redoOf
    ? await prisma.appointment.findFirst({
        where: { id: searchParams.redoOf, status: { in: FINISHED_STATUSES } },
        select: { id: true, scheduledAt: true, pet: { select: { name: true } } },
      })
    : null;
```

- in the server action, after the `owned` pet check and before `createAppointment`:

```ts
    // The redo link is a hidden field, so it is checked here like any other
    // posted id: a finished visit of this same pet, or nothing.
    const redoOfId = field("redoOfId");
    if (redoOfId) {
      const original = await prisma.appointment.findFirst({
        where: { id: redoOfId, petId, status: { in: FINISHED_STATUSES } },
        select: { id: true, redoOfId: true },
      });
      if (!original) throw new Error("That redo is for a different pet's visit");
    }
```

- pass `redoOfId: redoOfId || null,` to `createAppointment({...})`.
- in the form, before `<CustomerPetFields`:

```tsx
          {redoOf && (
            <p className="rounded-lg border border-stone-200 bg-well px-3 py-2 text-sm text-stone-700">
              <input type="hidden" name="redoOfId" value={redoOf.id} />
              Redo of {redoOf.pet.name}&apos;s {formatShopDate(redoOf.scheduledAt)} visit.
            </p>
          )}
```

Import `FINISHED_STATUSES` from `@/lib/analytics` and `formatShopDate` from `@/lib/utils` if not already. (`field()` returns `""` for a missing value.)

Services are chosen at the counter as for any booking (the picker has no default-services prop); the pet and customer are prefilled. Ledger: `Ruling: Book a redo prefills pet and customer, not services — the picker takes no defaults and a redo is often less than the original — cost if wrong: two clicks per redo.`

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test > <workspace>/task5-tests.txt 2>&1; tail -5 <workspace>/task5-tests.txt`
Expected: tsc clean; all suites pass except the known `app/seo-routes.test.ts` "cache is not a function".

Manual (dev server against the test DB, `npm run dev:test`): open a finished visit → "Book a redo" → the form shows "Redo of …" → book → the new visit's history note names the groomer and reason. Then edit the hidden `redoOfId` in devtools to another pet's visit id and submit → refused.

- [ ] **Step 5: Commit**

Stage only your hunks of `lib/create-appointment.ts`, `lib/stations.ts`, `app/staff/appointments/[id]/page.tsx` (per the precondition decision).

```bash
git add app/staff/appointments/new/page.tsx
# plus your hunks of the three files above
git commit -m "feat(booking): the groomer is the pet's best fit, and a redo books against its visit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Floor, insights and Analytics

**Files:**
- Modify: `lib/recommendations.ts` (`waitingPets` select; scoring ~line 105)
- Modify: `lib/insights.ts` (`petInsights` return; `shopInsights` Promise.all ~line 255 and push ~line 412)
- Modify: `app/staff/analytics/page.tsx` (Promise.all ~line 63; new section after Money per Hour ~line 392)
- Modify (not committed): `CLAUDE.md`

**Interfaces:**
- Consumes: `fitSamples`, `guideIdFor`, `fitInsightsNow`, `petFitInsights`, `groomerStrengths` (Task 4); `bookingGroomer`, `pct` (Task 2); `StrengthRow` (Task 3).

- [ ] **Step 1: Floor recommendations**

In `lib/recommendations.ts`:
- imports: `import { guidesForBreeds } from "@/lib/breeds";`, `import { bookingGroomer } from "@/lib/groomer-fit";`, `import { fitSamples, guideIdFor } from "@/lib/groomer-fit-queries";`
- `waitingPets` select adds `petId: true, serviceType: true,` and `pet: { select: { name: true, hasBiteHistory: true, breed: true } }`.
- in `assignmentSuggestions`, add `fitSamples()` to the `Promise.all` (fifth element, `samples`), then after `const free = availableStaff(roster);`:

```ts
  const guides = await guidesForBreeds(waiting.map((visit) => visit.pet.breed));
  const candidates = free.map((member) => ({ id: member.id, name: member.name }));
```

- inside `for (const visit of waiting)`, after the `usedPets` check:

```ts
      // Who suits this pet: the measured fit, else the owner's choice, else
      // who usually grooms it — among the people free right now.
      const pick = bookingGroomer(
        {
          petId: visit.petId,
          guideId: guideIdFor(guides, visit.pet.breed),
          serviceType: visit.serviceType,
          preferredStaffId: visit.customer.preferredStaffId,
          candidates,
        },
        samples
      );
```

- replace the "their usual groomer" block with:

```ts
        // The pet's best groomer is the strongest signal there is.
        if (pick?.staffId === member.id) {
          score += 50;
          reasons.push(pick.reason);
        }
```

- [ ] **Step 2: Insights**

In `lib/insights.ts`:
- `import { fitInsightsNow, petFitInsights } from "@/lib/groomer-fit-queries";`
- `petInsights`: change the final `return insights;` (~line 154) to `return [...insights, ...(await petFitInsights(petId))];`
- `shopInsights`: add `fit` to the destructured tuple after `pricing`, add to `Promise.all` after `priceInsightsNow(),`:

```ts
    // Where a groomer's errors on a breed run clearly above the shop's.
    fitInsightsNow(),
```

  and after `insights.push(...pricing);`: `insights.push(...fit);`

Check for an import cycle: `groomer-fit.ts` imports only a *type* from `insights.ts`, and `groomer-fit-queries.ts` likewise — same shape as `money-per-minute`. Run `npx tsc --noEmit` and the dashboard to confirm.

- [ ] **Step 3: Analytics — Groomer Strengths**

In `app/staff/analytics/page.tsx`:
- import `groomerStrengths` from `@/lib/groomer-fit-queries` and `pct, type StrengthAxis, type StrengthRow` from `@/lib/groomer-fit`.
- add `groomerStrengths()` as the last `Promise.all` element, destructured as `strengths`.
- above the component (module scope):

```tsx
const STRENGTH_AXES: { axis: StrengthAxis; label: string }[] = [
  { axis: "breed", label: "By Breed" },
  { axis: "size", label: "By Size" },
  { axis: "coat", label: "By Coat" },
];

const STRENGTH_FLAG: Record<NonNullable<StrengthRow["flag"]>, { label: string; className: string }> = {
  strength: { label: "Strength", className: "bg-green-100 text-green-800" },
  watch: { label: "Watch", className: "bg-red-100 text-red-700" },
};
```

- after the Money per Hour `)}` (~line 392):

```tsx
      {/* Who is good at what, against the shop. No cell with three visits, no band. */}
      {STRENGTH_AXES.some(({ axis }) => strengths[axis].length > 0) && (
        <PageSection title="Groomer Strengths" hint="Errors and hands-on minutes against the shop, last 12 months">
          {STRENGTH_AXES.filter(({ axis }) => strengths[axis].length > 0).map(({ axis, label }) => (
            <details key={axis} className="disclosure border-t border-stone-100 first:border-t-0">
              <summary className="py-2 text-sm font-semibold text-stone-800">{label}</summary>
              <div className="mb-3 border border-stone-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-well text-stone-500 text-[10px] tracking-tight">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">Groomer</th>
                        <th scope="col" className="px-3 py-2 text-left">Group</th>
                        <th scope="col" className="px-3 py-2 text-right">Visits</th>
                        <th scope="col" className="px-3 py-2 text-right">Errors</th>
                        <th scope="col" className="px-3 py-2 text-right">Hands-on</th>
                        <th scope="col" className="px-3 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {strengths[axis].map((row) => (
                        <tr key={row.key}>
                          <td className="px-3 py-2 font-semibold text-stone-900">{row.staffName}</td>
                          <td className="px-3 py-2">{row.group}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.visits}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {pct(row.rate)} <span className="text-stone-400">vs {pct(row.shopRate)}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.medianMins == null ? "—" : `${row.medianMins} min`}{" "}
                            {row.shopMedianMins != null && <span className="text-stone-400">vs {row.shopMedianMins}</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.flag && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STRENGTH_FLAG[row.flag].className}`}>
                                {STRENGTH_FLAG[row.flag].label}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </PageSection>
      )}
```

- [ ] **Step 4: CLAUDE.md (not committed)**

Under "### An insight that acts", after the **Money per hour** bullet, add:

```markdown
- **Groomer–pet fit.** [lib/groomer-fit.ts](lib/groomer-fit.ts) judges a
  groomer per pet (3+ visits by two groomers on it) else per breed guide ×
  service, over 12 months. **Errors gate, speed ranks**: an error visit is a
  `COMPLAINT`, `REDO`, `INJURY`, `BITE` or `BEHAVIORAL` event, a linked redo
  (`Appointment.redoOfId`, always the root visit), or a backward stage move
  with no `REWASH` logged. A groomer with 2+ error visits at 2× and 10 points
  over the breed's shop rate is never picked; among the rest the fastest median
  wins only by 15% and 10 minutes. The booking groomer is that winner, else the
  owner's `preferredStaffId` — **a preference, not a guarantee** — else whoever
  did most of the last five visits. A redo is never a sample: its minutes and
  error land on the visit it fixes, in money per hour too.
```

And in "### Assignment is derived", change "`Customer.preferredStaffId` picks the groomer (`preferredGroomer()` in [lib/stations.ts](lib/stations.ts))" to "the groomer is `bookingGroomerFor()` in [lib/groomer-fit-queries.ts](lib/groomer-fit-queries.ts) — measured fit, then `Customer.preferredStaffId`, then the usual groomer".

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint > <workspace>/task6-lint.txt 2>&1; tail -5 <workspace>/task6-lint.txt && npm test > <workspace>/task6-tests.txt 2>&1; tail -5 <workspace>/task6-tests.txt`
Expected: tsc clean; lint clean; all suites pass except the known `app/seo-routes.test.ts`.

Manual (`npm run dev:test`): dashboard renders; Analytics shows Groomer Strengths (demo data has 6 months of history) or no band at all; a pet profile renders.

- [ ] **Step 6: Commit**

`lib/insights.ts`, `lib/recommendations.ts`, `app/staff/analytics/page.tsx` — check `git diff HEAD` for foreign hunks first; stage only yours. Never stage `CLAUDE.md`.

```bash
git add lib/recommendations.ts lib/insights.ts app/staff/analytics/page.tsx
git commit -m "feat(fit): the floor, the insights and Analytics read who suits which pet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
