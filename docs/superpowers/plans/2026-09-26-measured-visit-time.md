# Measured Visit Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure where a visit's time goes from the status history the shop already writes, feed hands-on time into the learned booking length, and make finishing a groom tell the owner once per household.

**Architecture:** A pure module `lib/visit-time.ts` turns `AppointmentStatusHistory` rows into per-stage minutes, and holds the household rule and the name-joining. `changeAppointmentStatus()` gains a household step that moves a finished household to `READY_PICKUP` together and sends one message. The analytics page, the visit screen, the dashboard board chip and `petOverruns()` read the new module. Nothing new is stored.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 5.22 / Postgres, Vitest, jQuery (board chips only).

**Spec:** `docs/superpowers/specs/2026-09-26-measured-visit-time-design.md`

## Global Constraints

- No migration. Nothing new is stored; every figure is derived on read.
- Medians, never means. Reuse `median()` and `MIN_VISITS_FOR_PATTERN` (3) from `lib/rhythm.ts`.
- Every shop figure carries an evidence string.
- Unmeasured is `null`, never `0`. A stage never entered is absent.
- Stage mapping: `CHECKED_IN` waiting, `IN_PROGRESS` bath, `DRYING` drying, `FINISHING` table, `COMPLETE` waiting for the household, `READY_PICKUP` owner to collect. `SCHEDULED`, `CANCELLED`, `NO_SHOW`, `PICKED_UP` open nothing.
- A segment is unmeasured when it is under 1 minute, crosses a shop day (`shopDayKey()`), or is a bath/drying/table segment over 180 minutes.
- The spec's `petNames()` is named `joinPetNames()` here: `pets` is already the parameter name in every sender.
- Hands-on (spec: bath + table, measured when either is) is what `workedMins()` gates on; the figure it returns adds drying, as the spec's "hands-on + drying" asks.
- Unfinished = `CHECKED_IN`, `IN_PROGRESS`, `DRYING`, `FINISHING`. Only those hold a household back.
- Notification sends stay wrapped in `.catch(console.error)`.
- Notifications fire only for visits whose status actually moved to `READY_PICKUP` in this call.
- Copy: the only wording changes are the pet name(s) and the "is"/"are" verb in the ready email, text and call, plus the new labels this plan names verbatim. Nothing else is reworded.
- Never stage files you did not change in the task; someone else edits this tree concurrently. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `next lint` covers test files: an unused import fails the build.

## Review Focus

1. A visit left open overnight (owner collected, nobody tapped Picked Up) must show `—` for owner to collect, not 900 minutes. Pinned in Task 1 ("a forgotten overnight tap").
2. Re-saving `READY_PICKUP` on a visit already at `READY_PICKUP` must not message the owner again. Pinned in Task 4's scripted check (step 4, case C).
3. A household with one dog cancelled mid-visit must release the finished sibling. Pinned in Task 1 (`householdReadyToTell` cancelled case) and Task 4 case B.
4. The learned booking length must not shrink a pet's slot because a stage was clicked through: `workedMins()` counts a clicked-through stage as roughly zero, but a day-crossing or over-cap stage makes the whole figure unmeasured. Pinned in Task 1 (`workedMins` tests) and Task 2.
5. The kiosk and status API return the visit's real status after an automatic move (`READY_PICKUP`, not the `COMPLETE` it was sent). Pinned in Task 4 case A.

---

### Task 1: The arithmetic — `lib/visit-time.ts`

**Files:**
- Create: `lib/visit-time.ts`
- Test: `lib/visit-time.test.ts`

**Interfaces:**
- Consumes: `median`, `MIN_VISITS_FOR_PATTERN` from `@/lib/rhythm`; `shopDayKey` from `@/lib/utils`.
- Produces:
  - `type TimeBucket = "waiting" | "bath" | "drying" | "table" | "household" | "collect"`
  - `TIME_BUCKETS: readonly TimeBucket[]` (that order)
  - `BUCKET_LABEL: Record<TimeBucket, string>`
  - `interface HistoryRow { status: string; changedAt: Date }`
  - `interface VisitTime { mins: Partial<Record<TimeBucket, number | null>>; openBucket: TimeBucket | null; suspect: boolean }`
  - `visitTime(history: HistoryRow[], now: Date): VisitTime`
  - `workedMins(time: VisitTime): number | null`
  - `interface BucketSummary { bucket: TimeBucket; label: string; medianMins: number | null; visits: number; evidence: string }`
  - `summariseVisitTimes(times: VisitTime[]): BucketSummary[]`
  - `describeVisitTime(time: VisitTime): string | null`
  - `UNFINISHED_STATUSES: readonly string[]`
  - `householdReadyToTell(visits: { id: string; status: string }[]): string[]`
  - `waitingOn(visits: { status: string; petName: string }[]): string[]`
  - `joinPetNames(names: string[]): { names: string; verb: "is" | "are" }`

- [ ] **Step 1: Write the failing tests**

`lib/visit-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeVisitTime,
  householdReadyToTell,
  joinPetNames,
  summariseVisitTimes,
  visitTime,
  waitingOn,
  workedMins,
} from "./visit-time";

// 9:00 in the shop (America/Phoenix is UTC-7 all year).
const OPEN = new Date("2026-09-14T16:00:00Z");
const at = (mins: number) => new Date(OPEN.getTime() + mins * 60_000);
const row = (status: string, mins: number) => ({ status, changedAt: at(mins) });

/** A visit that went through every stage, finished and was collected. */
const fullVisit = [
  row("CHECKED_IN", 0),
  row("IN_PROGRESS", 10),
  row("DRYING", 40),
  row("FINISHING", 60),
  row("COMPLETE", 110),
  row("READY_PICKUP", 125),
  row("PICKED_UP", 155),
];

describe("visitTime", () => {
  it("puts each segment in its stage and ends it at the next row", () => {
    expect(visitTime(fullVisit, at(500))).toEqual({
      mins: { waiting: 10, bath: 30, drying: 20, table: 50, household: 15, collect: 30 },
      openBucket: null,
      suspect: false,
    });
  });

  it("reads rows in time order whatever order they arrive in", () => {
    expect(visitTime([...fullVisit].reverse(), at(500)).mins.table).toBe(50);
  });

  it("adds a second trip through a stage to the first", () => {
    const history = [
      row("CHECKED_IN", 0),
      row("IN_PROGRESS", 5),
      row("DRYING", 25),
      row("IN_PROGRESS", 35), // back for a rewash
      row("DRYING", 45),
      row("FINISHING", 60),
      row("COMPLETE", 90),
    ];
    const time = visitTime(history, at(95));
    expect(time.mins.bath).toBe(30);
    expect(time.mins.drying).toBe(25);
  });

  it("calls a stage clicked through unmeasured, not zero", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5), row("COMPLETE", 90)];
    const time = visitTime(history, at(95));
    expect(time.mins.drying).toBeNull();
    expect(time.suspect).toBe(false);
  });

  it("calls a forgotten overnight tap unmeasured", () => {
    // Collected at 5pm, Picked Up tapped at 9am the next day.
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 60), row("READY_PICKUP", 480), row("PICKED_UP", 1440)];
    expect(visitTime(history, at(1500)).mins.collect).toBeNull();
  });

  it("calls a groom stage over three hours unmeasured and marks the visit suspect", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 200)];
    const time = visitTime(history, at(210));
    expect(time.mins.table).toBeNull();
    expect(time.suspect).toBe(true);
  });

  it("lets waiting and owner-to-collect run all afternoon", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 60), row("READY_PICKUP", 70), row("PICKED_UP", 370)];
    expect(visitTime(history, at(400)).mins.collect).toBe(300);
  });

  it("measures an open visit up to now and says which stage is open", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10)];
    expect(visitTime(history, at(35))).toEqual({
      mins: { waiting: 10, bath: 25 },
      openBucket: "bath",
      suspect: false,
    });
  });

  it("opens nothing for a cancelled or scheduled row", () => {
    const history = [row("SCHEDULED", -600), row("CHECKED_IN", 0), row("CANCELLED", 20)];
    expect(visitTime(history, at(500))).toEqual({ mins: { waiting: 20 }, openBucket: null, suspect: false });
  });
});

describe("workedMins", () => {
  it("is bath plus drying plus table", () => {
    expect(workedMins(visitTime(fullVisit, at(500)))).toBe(100);
  });

  it("counts a clicked-through stage as nothing rather than giving up", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5), row("COMPLETE", 90)];
    expect(workedMins(visitTime(history, at(95)))).toBe(80);
  });

  it("gives up when a groom stage was cut for being too long", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 200)];
    expect(workedMins(visitTime(history, at(210)))).toBeNull();
  });

  it("is null when neither the bath nor the table was measured", () => {
    const history = [row("CHECKED_IN", 0), row("COMPLETE", 60)];
    expect(workedMins(visitTime(history, at(70)))).toBeNull();
  });
});

describe("summariseVisitTimes", () => {
  const finished = (tableMins: number) =>
    visitTime([row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 10 + tableMins), row("PICKED_UP", 20 + tableMins)], at(900));

  it("says nothing below the minimum number of visits", () => {
    const table = summariseVisitTimes([finished(40), finished(50)]).find((s) => s.bucket === "table");
    expect(table).toMatchObject({ medianMins: null, visits: 2 });
  });

  it("takes the median, so one long visit does not move it", () => {
    const table = summariseVisitTimes([finished(40), finished(45), finished(50), finished(170)]).find((s) => s.bucket === "table");
    expect(table).toMatchObject({ medianMins: 48, visits: 4, evidence: "Median of 4 visits" });
  });

  it("leaves out a stage that is still open", () => {
    const open = visitTime([row("CHECKED_IN", 0), row("COMPLETE", 30), row("READY_PICKUP", 40)], at(45));
    const collect = summariseVisitTimes([open]).find((s) => s.bucket === "collect");
    expect(collect?.visits).toBe(0);
  });

  it("returns every stage in order with its label", () => {
    expect(summariseVisitTimes([]).map((s) => s.label)).toEqual([
      "Waiting",
      "Bath",
      "Drying",
      "Table",
      "Waiting for the household",
      "Owner to collect",
    ]);
  });
});

describe("describeVisitTime", () => {
  it("lists the stages entered, dashes for unmeasured, and so far for the open one", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5)];
    expect(describeVisitTime(visitTime(history, at(60)))).toBe(
      "Waiting 10 min · Bath 30 min · Drying — · Table 20 min so far"
    );
  });

  it("is null when nothing was entered", () => {
    expect(describeVisitTime(visitTime([row("SCHEDULED", 0)], at(10)))).toBeNull();
  });
});

describe("householdReadyToTell", () => {
  it("tells the owner about a lone dog as soon as it finishes", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }])).toEqual(["a"]);
  });

  it("holds a finished dog while its sibling is still on the table", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }, { id: "b", status: "FINISHING" }])).toEqual([]);
  });

  it("releases every finished dog when the last one finishes", () => {
    expect(
      householdReadyToTell([
        { id: "a", status: "COMPLETE" },
        { id: "b", status: "COMPLETE" },
        { id: "c", status: "READY_PICKUP" },
      ])
    ).toEqual(["a", "b"]);
  });

  it("is not held back by a sibling cancelled or marked no-show", () => {
    expect(
      householdReadyToTell([
        { id: "a", status: "COMPLETE" },
        { id: "b", status: "CANCELLED" },
        { id: "c", status: "NO_SHOW" },
      ])
    ).toEqual(["a"]);
  });

  it("is not held back by a sibling that has not arrived", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }, { id: "b", status: "SCHEDULED" }])).toEqual(["a"]);
  });
});

describe("waitingOn", () => {
  it("names the dogs still being worked on", () => {
    expect(
      waitingOn([
        { status: "COMPLETE", petName: "Max" },
        { status: "DRYING", petName: "Bella" },
        { status: "SCHEDULED", petName: "Rex" },
      ])
    ).toEqual(["Bella"]);
  });
});

describe("joinPetNames", () => {
  it("joins one, two and three names the way they are said", () => {
    expect(joinPetNames(["Max"])).toEqual({ names: "Max", verb: "is" });
    expect(joinPetNames(["Max", "Bella"])).toEqual({ names: "Max and Bella", verb: "are" });
    expect(joinPetNames(["Max", "Bella", "Rex"])).toEqual({ names: "Max, Bella and Rex", verb: "are" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/visit-time.test.ts`
Expected: FAIL, `Failed to resolve import "./visit-time"`.

- [ ] **Step 3: Write the implementation**

`lib/visit-time.ts`:

```ts
import { MIN_VISITS_FOR_PATTERN, median } from "@/lib/rhythm";
import { shopDayKey } from "@/lib/utils";

/**
 * Where a visit's time went, read off the status history the shop already
 * writes. Nothing is stored: each history row opens a segment that ends at the
 * next row, and the stage it was opened in decides which figure it adds to.
 *
 * Check-in to finish is not blade time — an afternoon waiting for an owner
 * reads as a four-hour groom — so the figures are kept apart. Drying is its
 * own figure: some dogs are dried by hand and some sit in a cage dryer, and
 * the history cannot tell which.
 *
 * Pure. The queried half is `lib/visit-time-queries.ts`.
 */

export type TimeBucket = "waiting" | "bath" | "drying" | "table" | "household" | "collect";

export const TIME_BUCKETS: readonly TimeBucket[] = ["waiting", "bath", "drying", "table", "household", "collect"];

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  waiting: "Waiting",
  bath: "Bath",
  drying: "Drying",
  table: "Table",
  household: "Waiting for the household",
  collect: "Owner to collect",
};

/** Scheduled, cancelled, no-show and picked up open nothing. */
const BUCKET_OF: Partial<Record<string, TimeBucket>> = {
  CHECKED_IN: "waiting",
  IN_PROGRESS: "bath",
  DRYING: "drying",
  FINISHING: "table",
  COMPLETE: "household",
  READY_PICKUP: "collect",
};

/** Stages somebody is working in. Waiting can legitimately run all afternoon. */
const WORK_BUCKETS: readonly TimeBucket[] = ["bath", "drying", "table"];

/** Under this, a stage was clicked through rather than worked in. */
const MIN_SEGMENT_MINS = 1;

/** Over this, a groom stage is a forgotten tap, not a groom. */
const MAX_WORK_SEGMENT_MINS = 180;

export interface HistoryRow {
  status: string;
  changedAt: Date;
}

export interface VisitTime {
  /** Absent: never entered. Null: entered, but not a measurement. */
  mins: Partial<Record<TimeBucket, number | null>>;
  /** The stage the visit is in now, still running to `now`. */
  openBucket: TimeBucket | null;
  /** A groom stage crossed a day or ran past the cap, so the hands-on total cannot be trusted. */
  suspect: boolean;
}

export function visitTime(history: HistoryRow[], now: Date): VisitTime {
  const rows = [...history].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const raw: Partial<Record<TimeBucket, number | null>> = {};
  let openBucket: TimeBucket | null = null;
  let suspect = false;

  rows.forEach((current, index) => {
    const bucket = BUCKET_OF[current.status];
    if (!bucket) return;
    const next = rows[index + 1];
    const end = next?.changedAt ?? now;
    if (!next) openBucket = bucket;

    const length = (end.getTime() - current.changedAt.getTime()) / 60_000;
    const crossesDay = shopDayKey(current.changedAt) !== shopDayKey(end);
    const overCap = WORK_BUCKETS.includes(bucket) && length > MAX_WORK_SEGMENT_MINS;
    if (WORK_BUCKETS.includes(bucket) && (crossesDay || overCap)) suspect = true;

    // One bad segment spoils the stage: half a figure reads as a fast groom.
    if (raw[bucket] === null) return;
    raw[bucket] = length < MIN_SEGMENT_MINS || crossesDay || overCap ? null : (raw[bucket] ?? 0) + length;
  });

  const mins: Partial<Record<TimeBucket, number | null>> = {};
  for (const bucket of TIME_BUCKETS) {
    if (bucket in raw) mins[bucket] = raw[bucket] == null ? null : Math.round(raw[bucket] as number);
  }
  return { mins, openBucket, suspect };
}

/**
 * Bath, drying and table together: the time the dog actually took, against
 * which a booked slot is measured.
 *
 * A clicked-through stage took no time, so it adds nothing rather than
 * spoiling the sum. A stage cut for crossing a day or running past the cap
 * does spoil it — its real length is unknown.
 */
export function workedMins(time: VisitTime): number | null {
  if (time.suspect) return null;
  const { bath, table, drying } = time.mins;
  if (typeof bath !== "number" && typeof table !== "number") return null;
  return (bath ?? 0) + (drying ?? 0) + (table ?? 0);
}

export interface BucketSummary {
  bucket: TimeBucket;
  label: string;
  /** Null below `MIN_VISITS_FOR_PATTERN` measured visits. */
  medianMins: number | null;
  visits: number;
  evidence: string;
}

/** The shop's typical visit, stage by stage. Pass finished visits only. */
export function summariseVisitTimes(times: VisitTime[]): BucketSummary[] {
  return TIME_BUCKETS.map((bucket) => {
    // A stage still running is a figure so far, not a figure.
    const values = times
      .filter((time) => time.openBucket !== bucket)
      .map((time) => time.mins[bucket])
      .filter((mins): mins is number => typeof mins === "number");
    const enough = values.length >= MIN_VISITS_FOR_PATTERN;
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      medianMins: enough ? median(values) : null,
      visits: values.length,
      evidence: enough ? `Median of ${values.length} visits` : `${values.length} measured, ${MIN_VISITS_FOR_PATTERN} needed`,
    };
  });
}

/** One line for the visit screen, or null when the visit has not started. */
export function describeVisitTime(time: VisitTime): string | null {
  const parts = TIME_BUCKETS.filter((bucket) => bucket in time.mins).map((bucket) => {
    const mins = time.mins[bucket];
    const figure = mins == null ? "—" : `${mins} min`;
    return `${BUCKET_LABEL[bucket]} ${figure}${time.openBucket === bucket && mins != null ? " so far" : ""}`;
  });
  return parts.length ? parts.join(" · ") : null;
}

/** In the building and not yet finished: a dog the household is still waiting on. */
export const UNFINISHED_STATUSES: readonly string[] = ["CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING"];

/**
 * Which of one household's visits on one day to move to ready-for-pickup:
 * every finished one, once none is still being worked on. A sibling not yet
 * arrived, cancelled or a no-show holds nobody back.
 */
export function householdReadyToTell(visits: { id: string; status: string }[]): string[] {
  if (visits.some((visit) => UNFINISHED_STATUSES.includes(visit.status))) return [];
  return visits.filter((visit) => visit.status === "COMPLETE").map((visit) => visit.id);
}

/** The household's dogs still being worked on, by name. */
export function waitingOn(visits: { status: string; petName: string }[]): string[] {
  return visits.filter((visit) => UNFINISHED_STATUSES.includes(visit.status)).map((visit) => visit.petName);
}

/** "Max", "Max and Bella", "Max, Bella and Rex", with the verb to match. */
export function joinPetNames(names: string[]): { names: string; verb: "is" | "are" } {
  if (names.length <= 1) return { names: names[0] ?? "", verb: "is" };
  return { names: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`, verb: "are" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/visit-time.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint lib/visit-time.ts lib/visit-time.test.ts`
Expected: no output.

```bash
git add lib/visit-time.ts lib/visit-time.test.ts
git commit -m "feat(visit-time): where a visit's time went, read off its history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The learned slot measures hands-on time

**Files:**
- Modify: `lib/visit-duration.ts` (`MeasuredVisit`, `overrunsFrom`, `petOverruns`, and the `learnedDuration` doc comment)
- Test: `lib/visit-duration.test.ts`

**Interfaces:**
- Consumes: `visitTime`, `workedMins` from `@/lib/visit-time` (Task 1).
- Produces: `MeasuredVisit.workedMins?: number | null`. `overrunsFrom()` keeps its signature.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("overrunsFrom", ...)` block in `lib/visit-duration.test.ts`:

```ts
  it("measures hands-on time when the history had it, not the wait around it", () => {
    // Checked in to finished took 150 minutes; the groom itself took 70.
    expect(overrunsFrom([{ ...visit(60, 150), workedMins: 70 }])).toEqual([10]);
  });

  it("falls back to check-in to finish when hands-on time was not measured", () => {
    expect(overrunsFrom([{ ...visit(60, 90), workedMins: null }])).toEqual([30]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/visit-duration.test.ts`
Expected: FAIL. The first new test gets `[90]`, not `[10]`. (TypeScript does not fail vitest on the unknown property.)

- [ ] **Step 3: Implement**

In `lib/visit-duration.ts`, add the import:

```ts
import { visitTime, workedMins } from "@/lib/visit-time";
```

Add to `MeasuredVisit`:

```ts
  /** Bath, drying and table from the status history; null when not measured. */
  workedMins?: number | null;
```

Replace `overrunsFrom` with:

```ts
export function overrunsFrom(visits: MeasuredVisit[]): number[] {
  return visits
    .filter((visit) => visit.durationMins != null && (visit.workedMins != null || visit.checkedInAt != null))
    .map((visit) => {
      // Hands-on time when the history measured it; otherwise turnaround,
      // which counts the wait for the owner as groom and is why the clamp exists.
      const actual =
        visit.workedMins ??
        Math.round((visit.finishedAt.getTime() - (visit.checkedInAt as Date).getTime()) / 60_000);
      return actual - (visit.durationMins as number);
    })
    .filter((drift) => Number.isFinite(drift));
}
```

Replace `petOverruns` with:

```ts
/** The last measured visits for a pet. Ten is a season of grooms, not a career. */
export async function petOverruns(petId: string, take = 10): Promise<number[]> {
  const visits = await prisma.appointment.findMany({
    where: { petId, status: { in: FINISHED_STATUSES }, checkedInAt: { not: null } },
    select: {
      checkedInAt: true,
      completedAt: true,
      durationMins: true,
      updatedAt: true,
      statusHistory: { select: { status: true, changedAt: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take,
  });

  const now = new Date();
  return overrunsFrom(
    visits.map((visit) => ({
      checkedInAt: visit.checkedInAt,
      // completedAt is the fact; updatedAt is the last touch, which is the
      // best available stand-in for a visit closed out before that column
      // existed.
      finishedAt: visit.completedAt ?? visit.updatedAt,
      durationMins: visit.durationMins,
      workedMins: workedMins(visitTime(visit.statusHistory, now)),
    }))
  );
}
```

In the `learnedDuration` doc comment, replace the sentence beginning "A pet that once sat in the shop all afternoon" through "swallow the diary." with:

```ts
 * Clamped to half and double the catalog figure. Hands-on time is measured
 * from the status history where it can be, but a visit from before that, or
 * one whose stages were not tapped, still falls back to check-in to finish —
 * and one afternoon waiting for an owner must not book the next groom for
 * four hours.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/visit-duration.test.ts lib/visit-time.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npx eslint lib/visit-duration.ts lib/visit-duration.test.ts`
Expected: no output.

```bash
git add lib/visit-duration.ts lib/visit-duration.test.ts
git commit -m "feat(duration): the learned slot measures hands-on time, not the wait

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The ready message names every dog

**Files:**
- Modify: `lib/email.ts` (`sendReadyForPickup`)
- Modify: `lib/sms.ts` (`smsReadyForPickup`)
- Modify: `lib/voice.ts` (`voiceReadyForPickup`)
- Modify: `lib/appointment-status.ts` (the three call sites, temporarily passing `[updated.pet.name]`)

**Interfaces:**
- Consumes: `joinPetNames` from `@/lib/visit-time` (Task 1).
- Produces: each of the three senders takes `pets: string[]` in place of `petName: string`. Everything else in their signatures is unchanged.

This task has no new unit test: the senders are network calls, and the wording comes from `joinPetNames()`, which Task 1 tested. The typecheck is the gate: every caller must move to `pets`.

- [ ] **Step 1: Change `sendReadyForPickup`**

In `lib/email.ts`, add `import { joinPetNames } from "@/lib/visit-time";` beside the other imports. In `sendReadyForPickup`, replace the `petName` parameter and its type with `pets` / `pets: string[];`, and replace the body from `const from = await getFrom();` to the end of the `send` call with:

```ts
  const from = await getFrom();
  const { names, verb } = joinPetNames(pets);

  await resend.emails.send({
    from,
    to,
    subject: `${names} ${verb} ready for pickup! 🐾`,
    html: `
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p><strong>${escapeHtml(names)}</strong> ${verb} all done and ready to be picked up!</p>
      <p>Please come by at your earliest convenience.</p>
      ${
        findings.length
          ? `<p>While we were working, we noticed a few things worth mentioning:</p>
      <ul>${findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>
      <p>We are groomers, not vets — this is just what we saw, and your
         veterinarian is the one to ask about any of it.</p>`
          : ""
      }
      ${
        hasPhotos
          ? `<p>We took a few photos of ${escapeHtml(names)} today — they are on your visit in the customer portal.</p>`
          : ""
      }
      ${config.shopPhone ? `<p>Questions? Call us at ${escapeHtml(config.shopPhone)}.</p>` : ""}
      <p>— ${escapeHtml(config.shopName)}</p>
    `,
  });
```

- [ ] **Step 2: Change `smsReadyForPickup`**

In `lib/sms.ts`, add `import { joinPetNames } from "@/lib/visit-time";`. Replace the `petName` parameter and type with `pets` / `pets: string[];`, and the `body` with:

```ts
  const { names, verb } = joinPetNames(pets);
  const body =
    `${names} ${verb} ready for pickup at ${shopName}.` +
    (hasFindings ? ` We noticed a couple of things to mention when you collect.` : "") +
    (phone ? ` Questions? ${phone}` : "") +
    ` Reply STOP to opt out.`;
```

- [ ] **Step 3: Change `voiceReadyForPickup`**

In `lib/voice.ts`, add `import { joinPetNames } from "@/lib/visit-time";`. Replace the whole function with:

```ts
export async function voiceReadyForPickup({
  to,
  pets,
  shopName,
}: {
  to: string | null | undefined;
  pets: string[];
  shopName: string;
}): Promise<boolean> {
  const { names, verb } = joinPetNames(pets);
  return placeCall(to, `Hello, this is ${shopName}. ${names} ${verb} finished and ready to collect. Thank you.`);
}
```

- [ ] **Step 4: Keep the one caller compiling**

In `lib/appointment-status.ts`, change the three `petName: updated.pet.name,` lines to `pets: [updated.pet.name],`. Task 4 replaces this block.

- [ ] **Step 5: Typecheck, test, lint and commit**

Run: `npx tsc --noEmit && npx vitest run && npx eslint lib/email.ts lib/sms.ts lib/voice.ts lib/appointment-status.ts`
Expected: tsc and eslint print nothing; vitest all green.

```bash
git add lib/email.ts lib/sms.ts lib/voice.ts lib/appointment-status.ts
git commit -m "feat(notify): the ready message can name every dog in the household

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Finishing tells the owner, once per household

**Files:**
- Modify: `lib/appointment-status.ts`
- Scratch check: `$SCRATCH/household-check.ts`, where `$SCRATCH` is the session scratchpad. It is not committed.

**Interfaces:**
- Consumes: `householdReadyToTell` from `@/lib/visit-time` (Task 1); `shopDayRange` from `@/lib/utils`; the `pets: string[]` senders (Task 3).
- Produces: `changeAppointmentStatus()` keeps its signature. Its return value's `status` is `READY_PICKUP` when this call moved the visit there automatically.

`changeAppointmentStatus()` touches the database, SSE and three notifiers, so it has no unit test; the household rule inside it was tested in Task 1. The gate is a scripted check against the throwaway database `gentlegroomer_test`. Never run it against `gentlegroomer`.

- [ ] **Step 1: Write the scripted check and watch it fail**

Create `$SCRATCH/household-check.ts`. It points Prisma at the test database before importing anything that reads `DATABASE_URL`:

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
  const { changeAppointmentStatus } = await import("@/lib/appointment-status");

  const customer = await prisma.customer.findFirstOrThrow({ where: { pets: { some: {} } }, include: { pets: true } });
  const pet = customer.pets[0];
  const make = () =>
    prisma.appointment.create({
      data: { customerId: customer.id, petId: pet.id, scheduledAt: new Date(), status: "SCHEDULED", serviceType: "FULL_GROOM" },
    });
  const statusOf = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;
  const historyCount = async (id: string, status: "READY_PICKUP") =>
    prisma.appointmentStatusHistory.count({ where: { appointmentId: id, status } });
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) process.exitCode = 1;
  };

  // Today's other visits for this customer would join the household; park them.
  const { shopDayRange } = await import("@/lib/utils");
  const { start, end } = shopDayRange();
  await prisma.appointment.updateMany({
    where: { customerId: customer.id, scheduledAt: { gte: start, lt: end } },
    data: { status: "CANCELLED" },
  });

  // A: two dogs; the first finishes and waits, the second finishing releases both.
  const a1 = await make();
  const a2 = await make();
  for (const id of [a1.id, a2.id]) await changeAppointmentStatus({ appointmentId: id, status: "CHECKED_IN" });
  await changeAppointmentStatus({ appointmentId: a2.id, status: "FINISHING" });
  await changeAppointmentStatus({ appointmentId: a1.id, status: "COMPLETE" });
  check("A: first dog waits for its sibling", (await statusOf(a1.id)) === "COMPLETE");
  const returned = await changeAppointmentStatus({ appointmentId: a2.id, status: "COMPLETE" });
  check("A: last dog finishing releases both", (await statusOf(a1.id)) === "READY_PICKUP" && (await statusOf(a2.id)) === "READY_PICKUP");
  check("A: the call returns the status the visit ended at", returned.status === "READY_PICKUP");
  check("A: each moved visit has its own history row", (await historyCount(a1.id, "READY_PICKUP")) === 1 && (await historyCount(a2.id, "READY_PICKUP")) === 1);
  for (const id of [a1.id, a2.id]) await changeAppointmentStatus({ appointmentId: id, status: "PICKED_UP" });

  // B: a sibling cancelled releases the dog waiting on it.
  const b1 = await make();
  const b2 = await make();
  for (const id of [b1.id, b2.id]) await changeAppointmentStatus({ appointmentId: id, status: "CHECKED_IN" });
  await changeAppointmentStatus({ appointmentId: b1.id, status: "COMPLETE" });
  check("B: waits while sibling is checked in", (await statusOf(b1.id)) === "COMPLETE");
  await changeAppointmentStatus({ appointmentId: b2.id, status: "CANCELLED" });
  check("B: cancelled sibling releases it", (await statusOf(b1.id)) === "READY_PICKUP");
  await changeAppointmentStatus({ appointmentId: b1.id, status: "PICKED_UP" });

  // C: re-saving READY_PICKUP writes a row but moves nothing new.
  const c1 = await make();
  await changeAppointmentStatus({ appointmentId: c1.id, status: "CHECKED_IN" });
  await changeAppointmentStatus({ appointmentId: c1.id, status: "COMPLETE" });
  check("C: a lone dog is told at once", (await statusOf(c1.id)) === "READY_PICKUP");
  await changeAppointmentStatus({ appointmentId: c1.id, status: "READY_PICKUP" });
  check("C: a re-save stays at ready", (await statusOf(c1.id)) === "READY_PICKUP");
  await changeAppointmentStatus({ appointmentId: c1.id, status: "PICKED_UP" });

  await prisma.$disconnect();
}

main();
```

Case C checks the status only. The "no second message" half is enforced by the `before.status` guard in step 2 and read in review; the check cannot observe a send without credentials.

Run: `npx tsx --tsconfig tsconfig.json $SCRATCH/household-check.ts`
Expected: `FAIL A: first dog waits for its sibling` does NOT appear (COMPLETE is left alone today), but `FAIL A: last dog finishing releases both`, `FAIL B: cancelled sibling releases it` and `FAIL C: a lone dog is told at once` do. Exit code 1.

If `serviceType` or another required column is rejected, read the `Appointment` model in `prisma/schema.prisma` and add the missing required fields to `make()`. Record the change as a ruling.

- [ ] **Step 2: Implement the household step**

Rewrite `lib/appointment-status.ts` from `export async function changeAppointmentStatus` to the end of the file as follows. Keep `broadcastStationBoard` and `ownerVisibleFindings` exactly as they are. Add `householdReadyToTell` from `@/lib/visit-time` and `shopDayRange` from `@/lib/utils` to the imports; `formatVisitEvent` is already imported from there.

```ts
type StatusChange = {
  appointmentId: string;
  status: AppointmentStatus;
  note?: string;
  staffId?: string | null;
};

/** The change and its side effects on the floor. Tells nobody. */
async function applyStatus({ appointmentId, status, note, staffId }: StatusChange) {
  const now = new Date();

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      checkedInAt: status === AppointmentStatus.CHECKED_IN ? now : undefined,
      completedAt: status === AppointmentStatus.COMPLETE ? now : undefined,
      statusHistory: {
        create: { status, note, changedById: staffId ?? undefined },
      },
    },
    include: {
      pet: true,
      customer: {
        select: {
          firstName: true, lastName: true, phone: true, email: true,
          smsOptOut: true, voiceOptOut: true,
        },
      },
      staff: { select: { name: true } },
      station: true,
    },
  });

  if (updated.stationId) await broadcastStationBoard(updated.stationId);

  // Whatever path checked the pet in, a pet with no station waits behind a
  // door. Best effort here; the screens that can refuse check for room first.
  if (isWaitingUnplaced(updated)) await placeInKennel(updated.id);

  // The punch card follows the visit: finishing earns one, cancelling or a
  // no-show takes it back. Idempotent, so the three finished statuses in a row
  // still only ever earn one.
  await syncRewardForVisit(updated.id, updated.customerId, status);

  if (RELEASES_KENNEL.includes(status)) {
    const freedStationId = await releaseKennelForAppointment(updated.id);
    if (freedStationId) await broadcastKennelBoard(freedStationId);
  }

  return updated;
}

/**
 * Dogs from one home go home together, so the owner is told once, when the
 * last of them is done. Runs after every change, which is what lets a sibling
 * cancelled or marked a no-show release the dogs waiting on it. Returns the
 * visits it moved.
 */
async function tellHouseholdIfReady(
  visit: { customerId: string; scheduledAt: Date },
  staffId?: string | null
): Promise<string[]> {
  const { start, end } = shopDayRange(visit.scheduledAt);
  const household = await prisma.appointment.findMany({
    where: { customerId: visit.customerId, scheduledAt: { gte: start, lt: end } },
    select: { id: true, status: true },
  });
  const ready = householdReadyToTell(household);
  for (const id of ready) {
    await applyStatus({ appointmentId: id, status: AppointmentStatus.READY_PICKUP, note: "Household finished", staffId });
  }
  return ready;
}

/**
 * One email, one text and one call for every dog that just became ready.
 * Notification failures must never fail the status change. Every channel is
 * tried: the shop switches each on independently, and a customer who reads
 * neither email nor text is no reason for the pet to sit uncollected.
 */
async function notifyReady(
  customer: {
    firstName: string; lastName: string; phone: string | null; email: string | null;
    smsOptOut: boolean; voiceOptOut: boolean;
  },
  appointmentIds: string[]
) {
  const visits = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds } },
    select: { id: true, pet: { select: { name: true } } },
    orderBy: { checkedInAt: "asc" },
  });
  const pets = visits.map((visit) => visit.pet.name);
  // With more than one dog, a finding has to say whose ear it was.
  const findings = (
    await Promise.all(
      visits.map(async (visit) =>
        (await ownerVisibleFindings(visit.id)).map((finding) => (visits.length > 1 ? `${visit.pet.name}: ${finding}` : finding))
      )
    )
  ).flat();
  // Linked, not attached: the bytes stay behind /api/photos/[id].
  const sharedPhotos = await prisma.visitPhoto.count({
    where: { appointmentId: { in: appointmentIds }, ownerVisible: true },
  });

  if (customer.email) {
    await sendReadyForPickup({
      to: customer.email,
      ownerName: `${customer.firstName} ${customer.lastName}`,
      pets,
      findings,
      hasPhotos: sharedPhotos > 0,
    }).catch(console.error);
  }

  const config = await getConfig();

  if (customer.phone && !customer.smsOptOut) {
    await smsReadyForPickup({
      to: customer.phone,
      pets,
      shopName: config.shopName,
      phone: config.shopPhone,
      hasFindings: findings.length > 0,
    }).catch(console.error);
  }

  // The oldest notification a grooming shop has: the phone rings and somebody
  // says the dog is done. Its own flag and its own opt-out, so a household
  // that only wants a text still only gets one.
  if (customer.phone && !customer.voiceOptOut) {
    await voiceReadyForPickup({
      to: customer.phone,
      pets,
      shopName: config.shopName,
    }).catch(console.error);
  }
}

export async function changeAppointmentStatus(change: StatusChange) {
  const before = await prisma.appointment.findUnique({
    where: { id: change.appointmentId },
    select: { status: true },
  });
  const updated = await applyStatus(change);
  const told = await tellHouseholdIfReady(updated, change.staffId);

  // Only a visit that moved is news: a re-save of ready-for-pickup, or a
  // sibling already told, sends nothing. The manual action still tells the
  // owner early by hand.
  const pressedReady =
    change.status === AppointmentStatus.READY_PICKUP && before?.status !== AppointmentStatus.READY_PICKUP;
  const moved = pressedReady ? [updated.id, ...told] : told;
  if (moved.length) await notifyReady(updated.customer, moved);

  return told.includes(updated.id) ? { ...updated, status: AppointmentStatus.READY_PICKUP } : updated;
}
```

Update the file's header comment (the block above `RELEASES_KENNEL`) to:

```ts
/**
 * One place where a status change happens, so the API route, the kiosk and the
 * staff screens all produce the same side effects: an audit row, the station
 * display refresh, the kennel release, and — once the last dog of a household
 * is done — the message telling the owner.
 */
```

- [ ] **Step 3: Typecheck and run the unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; vitest all green, including `app/api/station/station-access.test.ts`, which mocks this module.

- [ ] **Step 4: Run the scripted check and watch it pass**

Run: `npx tsx --tsconfig tsconfig.json $SCRATCH/household-check.ts`
Expected: every line `PASS`, exit code 0.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint lib/appointment-status.ts`
Expected: no output.

```bash
git add lib/appointment-status.ts
git commit -m "feat(status): finishing tells the owner, once the whole household is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The board says who a finished dog is waiting for

**Files:**
- Modify: `app/staff/page.tsx` (the `boardPets` mapping, the `COMPLETE` branch of `pickupNote`)

**Interfaces:**
- Consumes: `waitingOn`, `joinPetNames` from `@/lib/visit-time` (Task 1).
- Produces: nothing new.

The logic is `waitingOn()` + `joinPetNames()`, both tested in Task 1. This task only wires them up, and its gate is the typecheck plus a look at the rendered page.

- [ ] **Step 1: Wire it**

In `app/staff/page.tsx`, add `import { joinPetNames, waitingOn } from "@/lib/visit-time";`. Directly above `const boardPets = todayAppointments`, add:

```ts
  // A finished dog whose sibling is still being worked on is held back, and
  // its chip says who for — the owner is told when the last one is done.
  const heldFor = (appointment: { id: string; customerId: string }) => {
    const names = waitingOn(
      todayAppointments
        .filter((visit) => visit.customerId === appointment.customerId && visit.id !== appointment.id)
        .map((visit) => ({ status: visit.status, petName: visit.pet.name }))
    );
    return names.length ? `Waiting for ${joinPetNames(names).names}` : "Notify owner";
  };
```

Replace:

```ts
        if (appointment.status === AppointmentStatus.COMPLETE) return { flags, pickupNote: "Notify owner" };
```

with:

```ts
        if (appointment.status === AppointmentStatus.COMPLETE) return { flags, pickupNote: heldFor(appointment) };
```

- [ ] **Step 2: Typecheck, lint and look**

Run: `npx tsc --noEmit && npx eslint app/staff/page.tsx`
Expected: no output.

Run `npm run dev:test` on a port other than 3000 (e.g. `PORT=3001 npm run dev:test`; never stop the user's server on 3000). Sign in and put two of one customer's dogs through check-in, with one at `COMPLETE` and the other at `FINISHING`. Open `/staff`.
Expected: the finished dog's chip reads `Waiting for <sibling>`. If you cannot sign in, record `Ruling: browser check skipped` with the reason.

- [ ] **Step 3: Commit**

```bash
git add app/staff/page.tsx
git commit -m "feat(board): a finished dog's chip says which sibling it is waiting for

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Visit Time on analytics and on the visit screen

**Files:**
- Create: `lib/visit-time-queries.ts`
- Modify: `app/staff/analytics/page.tsx` (the loader `Promise.all`, and a new band after the "Appointment outcomes" band)
- Modify: `app/staff/appointments/[id]/page.tsx` (the "Status history" panel)

**Interfaces:**
- Consumes: `visitTime`, `summariseVisitTimes`, `describeVisitTime`, `BucketSummary` (Task 1); `FINISHED_STATUSES` from `@/lib/analytics`.
- Produces: `visitTimeSummary(rangeDays: number, now?: Date): Promise<BucketSummary[]>`.

The arithmetic is tested in Task 1. The gate here is the typecheck, lint, and a look at both pages.

- [ ] **Step 1: The queried half**

`lib/visit-time-queries.ts`:

```ts
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
```

- [ ] **Step 2: The analytics band**

In `app/staff/analytics/page.tsx`, add `import { visitTimeSummary } from "@/lib/visit-time-queries";`. Change the loader to:

```ts
  const [shop, leaderboard, insights, config, comeback, visitTimes] = await Promise.all([
    getShopAnalytics(rangeDays),
    getLeaderboard(),
    shopInsights(),
    getConfig(),
    // Not bound to the range control above it: a cohort's window is 90 days,
    // so "the last 7 days" is not a question this one can be asked.
    retention(),
    visitTimeSummary(rangeDays),
  ]);
```

Directly after the closing `</PageSection>` of the "Appointment outcomes" band, add:

```tsx
      {/* Where a visit's time goes. No figure yet, no band. */}
      {visitTimes.some((stage) => stage.medianMins != null) && (
        <PageSection
          title="Visit Time"
          hint={`Median per finished visit, last ${rangeDays} days`}
          bodyClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          {visitTimes.map((stage) => (
            <div key={stage.bucket} className="rounded-lg bg-well px-3 py-2 ring-1 ring-well-line">
              <p className="text-3xl font-black leading-none tracking-tight tabular-nums text-stone-900">
                {stage.medianMins == null ? "—" : `${stage.medianMins} min`}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-stone-500">{stage.label}</p>
              <p className="text-[11px] text-stone-400">{stage.evidence}</p>
            </div>
          ))}
        </PageSection>
      )}
```

If `PageSection` has no `hint` prop, read `components/ui/PageShell.tsx`. The "Appointment outcomes" band already passes `hint`, so it should exist.

- [ ] **Step 3: The visit screen line**

In `app/staff/appointments/[id]/page.tsx`, add `import { describeVisitTime, visitTime } from "@/lib/visit-time";`. Directly after `if (!appointment) notFound();`, add:

```ts
  const timeLine = describeVisitTime(visitTime(appointment.statusHistory, new Date()));
```

In the "Status history" section, directly after its `</h2>`, add:

```tsx
          {timeLine && <p className="mb-3 text-xs text-stone-500">{timeLine}</p>}
```

- [ ] **Step 4: Typecheck, lint and look**

Run: `npx tsc --noEmit && npx eslint lib/visit-time-queries.ts app/staff/analytics/page.tsx "app/staff/appointments/[id]/page.tsx"`
Expected: no output.

With the test-database server from Task 5 (port 3001), open `/staff/analytics?range=90`.
Expected: a "Visit Time" band with six tiles. The demo's status trails should give most tiles a figure; any stage with too few measured visits shows `—`.

Open one visit from today's floor.
Expected: a line under "Status history", such as `Waiting 12 min · Bath 25 min so far`.

If you cannot sign in, record `Ruling: browser check skipped` with the reason.

- [ ] **Step 5: Commit**

```bash
git add lib/visit-time-queries.ts app/staff/analytics/page.tsx "app/staff/appointments/[id]/page.tsx"
git commit -m "feat(analytics): Visit Time, stage by stage, and each visit's own line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Say so in CLAUDE.md, and the full gate

**Files:**
- Modify: `CLAUDE.md`. It is git-ignored, so edit it and do not commit it.

- [ ] **Step 1: Update CLAUDE.md**

In "### An insight that acts", in the **Learned durations** bullet, replace the sentences from `Turnaround is check-in to finish, so an afternoon spent waiting for an owner` through `the clamp is what stops one of those swallowing the diary.` with:

```markdown
  A visit is measured by its **hands-on** time — bath, drying and table, read
  off the status history by [lib/visit-time.ts](lib/visit-time.ts) — and falls
  back to check-in to finish only when the stages were not tapped. That
  fallback counts an afternoon waiting for an owner as groom, which is what
  the clamp is for.
```

Under "### Appointment lifecycle", replace the sentence beginning `` `READY_PICKUP` triggers `sendReadyForPickup()` `` with:

```markdown
**Finishing tells the owner, once per household.** After every change,
`changeAppointmentStatus()` looks at the customer's visits on that shop day;
once none is still being worked on (`CHECKED_IN` to `FINISHING`), every
`COMPLETE` one moves to `READY_PICKUP` together, and one email, text and call
names all the dogs (`joinPetNames()`). A sibling not yet arrived, cancelled or
a no-show holds nobody back, and a held dog's board chip says who it is
waiting for. Only a visit that moved is news, so a re-save sends nothing. The
sends are wrapped in `.catch(console.error)` — keep notification sends
non-fatal.

**Where the time went is derived, never stored.** `visitTime()` in
[lib/visit-time.ts](lib/visit-time.ts) turns the history into waiting, bath,
drying, table, waiting for the household and owner to collect. A segment under
a minute, one crossing a shop day, or a groom stage over three hours is
unmeasured — `null`, never `0`. `/staff/analytics` shows the medians and the
visit screen shows the visit's own line.
```

- [ ] **Step 2: The full gate**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: tsc prints nothing; vitest all green; lint reports no errors.

If `tsc` reports errors that contradict the config (TS2802), delete `tsconfig.tsbuildinfo` and rerun.

No commit: CLAUDE.md is git-ignored.
