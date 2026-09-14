# Booking Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every appointment, however it is booked, is validated the same way
and assigned a groomer the same way.

**Architecture:** Four independent creation paths are collapsed onto one
`createAppointment()` in `lib/`. The wall-clock rules it enforces live in a
separate pure module with no Prisma import, so they are unit-testable against a
frozen clock.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma/PostgreSQL,
Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-09-13-shop-operations.md`

## Global Constraints

Inherited from the spec's "Global constraints" section. The ones this plan
trips over most:

- Money is cents. Wall-clock comparisons go through `SHOP_TIMEZONE`
  (`America/Phoenix`) — never `getHours()`, never `setHours(0,0,0,0)`.
- Status changes go through `changeAppointmentStatus()`. Never write `status`
  directly — **except** the initial status on `create`, which is what this plan
  writes.
- Server actions re-authorise themselves via `lib/auth-guards.ts`.
- Notification sends are non-fatal: `.catch(console.error)`.
- `next lint` covers test files; an unused import there fails `next build`.
- `npm test` and `npx tsc --noEmit` are clean. Keep them that way.

## Background for someone new to this codebase

There are four places an `Appointment` row is created today, and they disagree:

| Path | Validates time? | Kennel check? | `defaultAssignment()`? |
|---|---|---|---|
| `app/api/appointments/route.ts` POST | no | no | no |
| `app/portal/appointments/new/page.tsx` (`createPortalAppointment`) | no | no | no |
| `app/api/walk-in/route.ts` | no | no | no |
| `app/staff/appointments/new/page.tsx` | no | no | yes |

So the portal accepts a booking for last Tuesday at 3am on a day the shop is
shut, and a walk-in arrives attached to nobody. Patching each caller is four
diffs and four future regressions.

**No booking path checks kennel space.** `kennelDemand()` exists and is
correct, but every caller is a *display* — `app/staff/page.tsx`,
`app/staff/stations/page.tsx`, `app/staff/stations/[id]/page.tsx`,
`lib/insights.ts`. The shop can see it is full and still be booked into.
Task 2 gives it its first enforcing caller.

**A groomer's bookings are expected to overlap in wall time** — pets sit in
kennels between bath and groom. Do not add a per-groomer concurrency check. The
one-pet-at-a-time rule is enforced at runtime by `stationCapacity()`, which
returns 1 for groom and bath stations.

Existing helpers this plan builds on, all already present:

- `lib/utils.ts` — `SHOP_TIMEZONE`, `currentShopTime(date)` → `"HH:MM"` in shop
  time, `shopDayRange(date)` → half-open `[start, end)` for that shop day.
- `lib/shop-hours.ts` — `DAY_KEYS` (sunday-first), `shopDayIndex(date)`,
  `BusinessHours` / `DayHours` types, `clock("15:30")` → `"3:30pm"`.
- `lib/kennels.ts` — `kennelDemand(start, end)` → `{ capacity, occupied, reserved, free, perCompartment }`.
- `lib/stations.ts` — `defaultAssignment(customerId)` → `{ staffId, stationId }`.
- `lib/appointment-services.ts` — `resolveSelectedServices(ids)`.
- `lib/pricing-tiers.ts` — `bookingRateSnapshot(customerId, lines)`.
- `lib/config.ts` — `getConfig()`, upserts the single row so it always exists.

---

## File Structure

- **Create** `lib/booking-validation.ts` — pure wall-clock rules. No Prisma, no
  React, no network. This is what makes the rules testable.
- **Create** `lib/booking-validation.test.ts` — Vitest, frozen clock.
- **Create** `lib/create-appointment.ts` — the one creation path. Imports
  Prisma; not unit-tested (no test DB harness in this repo for `lib/`).
- **Modify** `app/api/appointments/route.ts` — POST delegates.
- **Modify** `app/api/walk-in/route.ts` — delegates.
- **Modify** `app/portal/appointments/new/page.tsx` — server action delegates.
- **Modify** `app/staff/appointments/new/page.tsx` — server action delegates.

---

### Task 1: Pure booking-time rules

**Files:**
- Create: `lib/booking-validation.ts`
- Test: `lib/booking-validation.test.ts`

**Interfaces:**
- Consumes: `BusinessHours`, `DAY_KEYS`, `shopDayIndex` from `@/lib/shop-hours`;
  `currentShopTime` from `@/lib/utils`.
- Produces:
  ```ts
  export type BookingRefusalCode =
    | "PAST" | "CLOSED_DAY" | "OUTSIDE_HOURS" | "TOO_SOON" | "TOO_FAR";
  export type BookingRefusal = { code: BookingRefusalCode; message: string };
  export function validateBookingTime(input: {
    scheduledAt: Date;
    hours: BusinessHours | null;
    leadHours: number;
    windowDays: number;
    enforceWindow: boolean;
    now?: Date;
  }): BookingRefusal | null;
  ```
  Returns `null` when the time is acceptable. Task 2 consumes it.

- [ ] **Step 1: Write failing tests**

Create `lib/booking-validation.test.ts`:

```ts
import { describe, expect, it, afterEach, vi } from "vitest";
import { validateBookingTime } from "./booking-validation";
import type { BusinessHours } from "./shop-hours";

// Mon–Fri 8–5, Saturday 9–3, closed Sunday.
const HOURS: BusinessHours = {
  sunday: null,
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "15:00" },
};

// Phoenix never observes DST, so a fixed -07:00 offset is exact year-round.
const at = (iso: string) => new Date(`${iso}-07:00`);

// Wednesday 2026-09-16, 9am shop time.
const NOW = at("2026-09-16T09:00:00");

const base = {
  hours: HOURS,
  leadHours: 2,
  windowDays: 30,
  enforceWindow: true,
  now: NOW,
};

afterEach(() => vi.useRealTimers());

describe("validateBookingTime", () => {
  it("accepts a time inside opening hours and outside the lead window", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T10:00:00") })).toBeNull();
  });

  it("refuses a time in the past", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-15T10:00:00") }))
      .toMatchObject({ code: "PAST" });
  });

  it("refuses a day the shop is closed", () => {
    // Sunday.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-20T10:00:00") }))
      .toMatchObject({ code: "CLOSED_DAY" });
  });

  it("refuses a time before opening", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T07:30:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("refuses a time at or after closing", () => {
    // Close is exclusive: a 5pm booking on a shop that shuts at 5pm is refused.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-17T17:00:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("uses that day's own hours, not yesterday's", () => {
    // Saturday shuts at 3pm even though weekdays run to 5pm.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-19T16:00:00") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-19T14:00:00") })).toBeNull();
  });

  it("refuses a booking inside the lead window", () => {
    // 10am today, with a 2-hour lead at 9am.
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-16T10:00:00") }))
      .toMatchObject({ code: "TOO_SOON" });
  });

  it("accepts a booking exactly at the lead boundary", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-09-16T11:00:00") })).toBeNull();
  });

  it("refuses a booking beyond the booking window", () => {
    expect(validateBookingTime({ ...base, scheduledAt: at("2026-11-02T10:00:00") }))
      .toMatchObject({ code: "TOO_FAR" });
  });

  it("skips the lead and window checks for staff", () => {
    const staff = { ...base, enforceWindow: false };
    // Ten minutes from now: a customer at the counter.
    expect(validateBookingTime({ ...staff, scheduledAt: at("2026-09-16T09:10:00") })).toBeNull();
    expect(validateBookingTime({ ...staff, scheduledAt: at("2026-11-02T10:00:00") })).toBeNull();
  });

  it("still refuses the past for staff", () => {
    expect(validateBookingTime({
      ...base,
      enforceWindow: false,
      scheduledAt: at("2026-09-15T10:00:00"),
    })).toMatchObject({ code: "PAST" });
  });

  it("accepts any open-hours time when the shop has published no hours", () => {
    expect(validateBookingTime({ ...base, hours: null, scheduledAt: at("2026-09-20T10:00:00") }))
      .toBeNull();
  });

  it("evaluates the day in shop time, not the server's zone", () => {
    // 2026-09-21T01:00:00Z is Sunday in UTC but still Saturday 6pm in Phoenix —
    // and Saturday shuts at 3pm, so this is OUTSIDE_HOURS, never CLOSED_DAY.
    expect(validateBookingTime({ ...base, scheduledAt: new Date("2026-09-21T01:00:00Z") }))
      .toMatchObject({ code: "OUTSIDE_HOURS" });
  });

  it("defaults `now` to the real clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(validateBookingTime({
      hours: HOURS,
      leadHours: 2,
      windowDays: 30,
      enforceWindow: true,
      scheduledAt: at("2026-09-16T10:00:00"),
    })).toMatchObject({ code: "TOO_SOON" });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run lib/booking-validation.test.ts`
Expected: FAIL — `Failed to resolve import "./booking-validation"`.

- [ ] **Step 3: Write the implementation**

Create `lib/booking-validation.ts`:

```ts
import { clock, DAY_KEYS, shopDayIndex, type BusinessHours } from "@/lib/shop-hours";
import { currentShopTime } from "@/lib/utils";

/**
 * The wall-clock rules a booking has to clear, with no database in them.
 *
 * This is deliberately pure: every rule here is a timezone comparison, which
 * is the easiest thing in this codebase to get subtly wrong, and the only way
 * to hold it still is to test it against a frozen clock. `lib/create-appointment.ts`
 * is the half that talks to Postgres.
 *
 * What is NOT here, on purpose: any per-groomer concurrency check. Pets sit in
 * kennels between the bath and the table, so one groomer's bookings are
 * *expected* to overlap in wall time. One pet at a time is enforced on the
 * floor by `stationCapacity()`, which returns 1 for a groom or bath station.
 */

export type BookingRefusalCode =
  | "PAST"
  | "CLOSED_DAY"
  | "OUTSIDE_HOURS"
  | "TOO_SOON"
  | "TOO_FAR";

export type BookingRefusal = { code: BookingRefusalCode; message: string };

/** Minutes since shop-local midnight for a moment. */
function shopMinutes(at: Date): number {
  const [h, m] = currentShopTime(at).split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight for an "HH:MM" string; NaN if unparseable. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/**
 * Refuse what is definitely wrong, and nothing else. Returns null to accept.
 *
 * `enforceWindow` is false for staff: they book a customer standing at the
 * counter for ten minutes' time, and they book months out for a regular. The
 * lead time and booking window are promises made to *customers* on the public
 * site, not rules about when the shop may write in its own diary.
 */
export function validateBookingTime(input: {
  scheduledAt: Date;
  hours: BusinessHours | null;
  leadHours: number;
  windowDays: number;
  enforceWindow: boolean;
  now?: Date;
}): BookingRefusal | null {
  const { scheduledAt, hours, leadHours, windowDays, enforceWindow } = input;
  const now = input.now ?? new Date();

  if (scheduledAt.getTime() < now.getTime()) {
    return { code: "PAST", message: "That time has already passed." };
  }

  if (enforceWindow) {
    const leadMs = leadHours * 60 * 60 * 1000;
    if (scheduledAt.getTime() - now.getTime() < leadMs) {
      return {
        code: "TOO_SOON",
        message:
          leadHours === 1
            ? "Please book at least 1 hour ahead, or call the shop."
            : `Please book at least ${leadHours} hours ahead, or call the shop.`,
      };
    }

    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    if (scheduledAt.getTime() - now.getTime() > windowMs) {
      return {
        code: "TOO_FAR",
        message: `Bookings open ${windowDays} days ahead.`,
      };
    }
  }

  // No published hours means the shop has not told us when it is shut, and
  // guessing would refuse real bookings. Let it through.
  if (!hours) return null;

  // The shop's own weekday, not the server's: in Phoenix a UTC evening is
  // still the afternoon before, and reading the wrong row here would refuse a
  // Saturday booking for being a Sunday.
  const day = hours[DAY_KEYS[shopDayIndex(scheduledAt)]];
  if (!day) {
    return { code: "CLOSED_DAY", message: "The shop is closed that day." };
  }

  const minute = shopMinutes(scheduledAt);
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;

  // Close is exclusive — a visit starting as the door is locked is not a visit.
  if (minute < open || minute >= close) {
    return {
      code: "OUTSIDE_HOURS",
      message: `That day the shop is open ${clock(day.open)}–${clock(day.close)}.`,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run lib/booking-validation.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean. If `tsc` reports TS2802 on `Set` iteration, delete the
stale `tsconfig.tsbuildinfo` and rerun — it contradicts the current config.

- [ ] **Step 6: Commit**

```bash
git add lib/booking-validation.ts lib/booking-validation.test.ts
git commit -m "feat(booking): pure wall-clock rules for booking times"
```

---

### Task 2: One creation path

**Files:**
- Create: `lib/create-appointment.ts`

**Interfaces:**
- Consumes: `validateBookingTime` / `BookingRefusalCode` (Task 1);
  `resolveSelectedServices` from `@/lib/appointment-services`;
  `bookingRateSnapshot` from `@/lib/pricing-tiers`;
  `serviceFloorCents` from `@/lib/pricing`;
  `defaultAssignment` from `@/lib/stations`;
  `kennelDemand` from `@/lib/kennels`;
  `shopDayRange` from `@/lib/utils`;
  `getConfig` from `@/lib/config`.
- Produces, consumed by Tasks 3–6:
  ```ts
  export type CreateAppointmentInput = {
    customerId: string;
    petId: string;
    scheduledAt: Date;
    serviceIds?: string[];
    serviceType?: ServiceType;
    appointmentType?: AppointmentType;
    stationId?: string | null;
    staffId?: string | null;
    durationMins?: number | null;
    visitNotes?: string | null;
    needsKennel?: boolean;
    status?: AppointmentStatus;
    /** Customer-facing callers pass true: lead time, booking window, kennel space. */
    enforceCustomerRules: boolean;
    /** Staff id for the audit row; null for a customer-made booking. */
    changedById?: string | null;
    note?: string;
  };
  export type CreateAppointmentFailure = {
    ok: false;
    code: BookingRefusalCode | "NOT_FOUND" | "PET_MISMATCH" | "NO_SERVICES" | "NO_KENNEL";
    message: string;
  };
  export type CreateAppointmentSuccess = { ok: true; appointment: AppointmentWithRelations };
  export async function createAppointment(
    input: CreateAppointmentInput
  ): Promise<CreateAppointmentSuccess | CreateAppointmentFailure>;
  export const APPOINTMENT_INCLUDE: { ... }; // re-used by the API route
  ```

**Note on authorisation:** `createAppointment()` does **not** check auth. It is
a library function; the four callers are the trust boundaries and each already
authorises. Do not add a session lookup here — it would be wrong for the
walk-in kiosk path and invisible to the staff path.

- [ ] **Step 1: Write the implementation**

Create `lib/create-appointment.ts`:

```ts
import { AppointmentStatus, AppointmentType, Prisma, ServiceType } from "@prisma/client";
import { resolveSelectedServices, sendBookingNotifications } from "@/lib/appointment-services";
import { validateBookingTime, type BookingRefusalCode } from "@/lib/booking-validation";
import { getConfig } from "@/lib/config";
import { kennelDemand } from "@/lib/kennels";
import { serviceFloorCents } from "@/lib/pricing";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";
import { prisma } from "@/lib/prisma";
import type { BusinessHours } from "@/lib/shop-hours";
import { defaultAssignment } from "@/lib/stations";
import { shopDayRange } from "@/lib/utils";

/**
 * The one place an Appointment row is created.
 *
 * There were four: the staff form, the portal server action, the appointments
 * API and the walk-in route. Only the staff form validated anything, so the
 * portal would take a booking for a day the shop is shut and a walk-in arrived
 * attached to nobody. Guarding each caller separately is four diffs and four
 * future regressions; this is one.
 *
 * `enforceCustomerRules` is the only difference between the paths. Staff skip
 * the lead time and the booking window — those are promises made to customers
 * on the public site, not rules about the shop's own diary — and skip the
 * kennel refusal, because a person standing at the counter is the shop's
 * problem to solve, not the software's to refuse.
 */

export const APPOINTMENT_INCLUDE = {
  pet: true,
  customer: true,
  station: true,
  staff: true,
  statusHistory: { orderBy: { changedAt: "asc" as const } },
} as const;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

export type CreateAppointmentInput = {
  customerId: string;
  petId: string;
  scheduledAt: Date;
  serviceIds?: string[];
  serviceType?: ServiceType;
  appointmentType?: AppointmentType;
  stationId?: string | null;
  staffId?: string | null;
  durationMins?: number | null;
  visitNotes?: string | null;
  needsKennel?: boolean;
  status?: AppointmentStatus;
  enforceCustomerRules: boolean;
  changedById?: string | null;
  note?: string;
};

export type CreateAppointmentFailure = {
  ok: false;
  code: BookingRefusalCode | "NOT_FOUND" | "PET_MISMATCH" | "NO_SERVICES" | "NO_KENNEL";
  message: string;
};

export type CreateAppointmentSuccess = { ok: true; appointment: AppointmentWithRelations };

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<CreateAppointmentSuccess | CreateAppointmentFailure> {
  const config = await getConfig();

  // A walk-in is already standing in the shop; refusing it for being outside
  // the booking window would be absurd. Its own window is checked by the
  // walk-in route, which owns that rule.
  const isWalkIn = input.appointmentType === AppointmentType.WALK_IN;
  if (!isWalkIn) {
    const refusal = validateBookingTime({
      scheduledAt: input.scheduledAt,
      hours: (config.businessHours as BusinessHours | null) ?? null,
      leadHours: config.bookingLeadHours,
      windowDays: config.bookingWindowDays,
      enforceWindow: input.enforceCustomerRules,
    });
    if (refusal) return { ok: false, code: refusal.code, message: refusal.message };
  }

  const [customer, pet] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }),
    prisma.pet.findUnique({
      where: { id: input.petId },
      select: { id: true, customerId: true },
    }),
  ]);
  if (!customer) return { ok: false, code: "NOT_FOUND", message: "Customer not found." };
  if (!pet) return { ok: false, code: "NOT_FOUND", message: "Pet not found." };
  if (pet.customerId !== input.customerId) {
    return { ok: false, code: "PET_MISMATCH", message: "That pet belongs to someone else." };
  }

  const resolved = await resolveSelectedServices(input.serviceIds ?? []);
  if (input.serviceIds?.length && !resolved) {
    return { ok: false, code: "NO_SERVICES", message: "No such services." };
  }

  // A visit carries line items or it is invisible to the service mix and to
  // revenue. When only a legacy serviceType was sent, stand in the catalog row
  // for that type. serviceId is nullable on the line, so a shop can retire a
  // catalog row while visits that used it stay on the books.
  let lines: {
    serviceId: string | null;
    serviceType: ServiceType;
    priceCents: number | null;
    sortOrder: number;
  }[] = resolved?.lines ?? [];
  const serviceType = resolved?.primaryType ?? input.serviceType;
  if (!serviceType) {
    return { ok: false, code: "NO_SERVICES", message: "Choose at least one service." };
  }

  if (lines.length === 0) {
    const catalogService = await prisma.service.findFirst({
      where: { type: serviceType, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    lines = [
      {
        serviceId: catalogService?.id ?? null,
        serviceType,
        priceCents: catalogService ? serviceFloorCents(catalogService) : null,
        sortOrder: 0,
      },
    ];
  }

  const needsKennel = input.needsKennel ?? true;

  // Somewhere to put the dog. Only customer-facing paths are refused: staff
  // booking over capacity are making a decision, not a mistake.
  if (needsKennel && input.enforceCustomerRules) {
    const { start, end } = shopDayRange(input.scheduledAt);
    const demand = await kennelDemand(start, end);
    if (demand.free <= 0) {
      return {
        ok: false,
        code: "NO_KENNEL",
        message: "The shop is full that day. Please pick another, or call us.",
      };
    }
  }

  // Bookings do not ask for a groomer or a station: the customer's preferred
  // groomer picks both, and the groomer's own station follows.
  //
  // Derived per FIELD, not per object. Naming a groomer while leaving the
  // station blank must still pick up that groomer's default station — the
  // station follows the person, which is the whole point of the rule. An
  // explicit value still wins for the field it was given for.
  const derived =
    input.staffId === undefined || input.stationId === undefined
      ? await defaultAssignment(input.customerId)
      : { staffId: null, stationId: null };

  const staffId = input.staffId === undefined ? derived.staffId : input.staffId;

  // The station follows the groomer, so a derived station is only right when
  // the derived groomer is the one actually taking the visit. Staff naming a
  // different groomer must not inherit the preferred groomer's table.
  const stationId =
    input.stationId === undefined
      ? staffId !== null && staffId === derived.staffId
        ? derived.stationId
        : null
      : input.stationId;

  const assignment = { staffId, stationId };

  // Snapshot the customer's negotiated rate onto the visit, so editing the
  // tier later never reprices what was quoted here.
  const rate = await bookingRateSnapshot(input.customerId, lines);
  const status = input.status ?? AppointmentStatus.SCHEDULED;

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        customerId: input.customerId,
        petId: input.petId,
        scheduledAt: input.scheduledAt,
        serviceType,
        appointmentType: input.appointmentType ?? AppointmentType.APPOINTMENT,
        stationId: assignment.stationId,
        staffId: assignment.staffId,
        durationMins: input.durationMins ?? resolved?.totalDurationMins ?? null,
        visitNotes: input.visitNotes ?? null,
        needsKennel,
        status,
        checkedInAt: status === AppointmentStatus.CHECKED_IN ? new Date() : null,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
        services: { create: lines },
      },
      include: APPOINTMENT_INCLUDE,
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: created.id,
        status,
        changedById: input.changedById ?? null,
        note: input.note ?? "Appointment created",
      },
    });

    return created;
  });

  // Tell the customer, by whichever channels the shop runs. Both the portal
  // and the staff form called this themselves; POST /api/appointments and the
  // walk-in route never did, so those two booked people silently. Doing it
  // here is what makes that uniform.
  //
  // Non-fatal, always: a carrier outage or an unset RESEND_API_KEY must never
  // fail a booking. sendBookingNotifications() already swallows per-channel
  // failures; this catch covers the lookup around them.
  await sendBookingNotifications(appointment.id).catch(console.error);

  return { ok: true, appointment };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `resolveSelectedServices` does not expose
`totalDurationMins` or `primaryType` under those names, read
`lib/appointment-services.ts` and use the real ones rather than adding a
wrapper — it is imported here precisely so there is one copy of that logic.

- [ ] **Step 3: Commit**

```bash
git add lib/create-appointment.ts
git commit -m "feat(booking): single createAppointment path with validation and assignment"
```

---

### Task 3: Appointments API delegates

**Files:**
- Modify: `app/api/appointments/route.ts` (the `POST` handler, and the local
  `APPOINTMENT_INCLUDE` at the top)

**Interfaces:**
- Consumes: `createAppointment`, `APPOINTMENT_INCLUDE` (Task 2).
- Produces: nothing new. The route's response shape is unchanged — still the
  created appointment as JSON with status 201.

- [ ] **Step 1: Replace the POST body**

Delete the local `APPOINTMENT_INCLUDE` const and import it from
`@/lib/create-appointment` instead (the `GET` handler uses it too). Then
replace everything in `POST` after `const body = parsed.data;` with:

```ts
  const result = await createAppointment({
    customerId: body.customerId,
    petId: body.petId,
    scheduledAt: body.scheduledAt,
    serviceIds: body.serviceIds,
    serviceType: body.serviceType,
    appointmentType: body.appointmentType,
    stationId: body.stationId ?? undefined,
    staffId: body.staffId ?? undefined,
    durationMins: body.durationMins,
    visitNotes: body.visitNotes,
    // Staff-only route: skip the lead time and booking window.
    enforceCustomerRules: false,
    changedById: session.user.id,
  });

  if (!result.ok) {
    // NOT_FOUND is the only 404 here; everything else is the caller sending a
    // time or a pet the shop cannot take.
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result.appointment, { status: 201 });
```

Remove the now-dead imports: `resolveSelectedServices`, `bookingRateSnapshot`,
`serviceFloorCents`, `AppointmentType` if unused, `Prisma` if unused. **`next
lint` fails the build on an unused import.**

Note `stationId`/`staffId` pass `undefined` rather than `null` when absent —
`createAppointment` reads `undefined` as "nobody chose, so derive it" and
`null` as "explicitly nobody".

- [ ] **Step 2: Verify by hand**

Run `npm run dev`, sign in as staff, and POST a booking for a day the shop is
shut:

```bash
curl -i -X POST localhost:3000/api/appointments \
  -H 'Content-Type: application/json' \
  -b 'authjs.session-token=<copy from browser devtools>' \
  -d '{"customerId":"<id>","petId":"<id>","scheduledAt":"2026-09-20T17:00:00Z","serviceType":"FULL_GROOM"}'
```

Expected: `400` with `{"error":"The shop is closed that day.","code":"CLOSED_DAY"}`.
Repeat with a Wednesday 10am and expect `201`.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/appointments/route.ts
git commit -m "refactor(api): appointments POST delegates to createAppointment"
```

---

### Task 4: Walk-in route delegates

**Files:**
- Modify: `app/api/walk-in/route.ts`

**Interfaces:**
- Consumes: `createAppointment` (Task 2).
- Produces: nothing new.

This is the route that closes gap item 9 — a walk-in currently arrives with no
groomer and no station because it never calls `defaultAssignment()`.

- [ ] **Step 1: Replace the creation block**

Keep the route's existing auth check, its `isWithinWalkInWindow()` check, and
its `featureWalkInPortal` flag check — the walk-in window is this route's own
rule and `createAppointment` deliberately skips it for `WALK_IN`. Replace the
`prisma.appointment.create` / status-history block with:

```ts
  const result = await createAppointment({
    customerId,
    petId,
    scheduledAt: new Date(),
    serviceIds,
    serviceType,
    appointmentType: AppointmentType.WALK_IN,
    // A walk-in is already here: it gets a groomer and a station like any
    // other visit, which it never did before.
    status: AppointmentStatus.CHECKED_IN,
    enforceCustomerRules: false,
    changedById: session.user.userType === "staff" ? session.user.id : null,
    note: "Walk-in checked in",
  });

  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result.appointment, { status: 201 });
```

Read the file first — the existing variable names for `customerId`, `petId` and
the service selection may differ. Do not rename them; match what is there.

- [ ] **Step 2: Verify the groomer is attached**

Set a customer's preferred groomer at `/staff/customers/[id]`, give that groomer
a `defaultStation` at `/admin/staff`, then create a walk-in for them through
the portal. Open `/staff/appointments` and confirm the chip shows a groomer and
a station. Before this change both were blank.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add app/api/walk-in/route.ts
git commit -m "fix(walk-in): assign a groomer and station like every other visit"
```

---

### Task 5: Portal booking delegates

**Files:**
- Modify: `app/portal/appointments/new/page.tsx` — the `createPortalAppointment`
  server action (around line 116) and the `<input type="time">` (hardcoded
  `min="08:00" max="17:00"`)

**Interfaces:**
- Consumes: `createAppointment` (Task 2); `getConfig` (already imported on this
  page for the waiver and feature flags — check before adding).
- Produces: nothing new.

This is the path that closes gap item 2 — the form advertises hours the server
never checks, and the `min`/`max` on the time input are hardcoded rather than
read from `SystemConfig.businessHours`.

- [ ] **Step 1: Replace the action body**

Keep the existing auth and waiver checks. Replace the `prisma.appointment.create`
call with:

```ts
    const result = await createAppointment({
      customerId: session.user.id,
      petId,
      scheduledAt,
      serviceIds,
      // A customer is held to the lead time, the booking window and the
      // shop's opening hours — all three are promises the public site makes.
      enforceCustomerRules: true,
      changedById: null,
      note: "Booked by the customer",
    });

    if (!result.ok) {
      // Re-render with the reason rather than throwing: the customer needs to
      // know the shop shuts at 3pm on a Saturday, not see an error page.
      redirect(`/portal/appointments/new?error=${encodeURIComponent(result.message)}`);
    }

    redirect("/portal/appointments");
```

**`redirect()` throws to unwind** — do not wrap these in `try`/`catch`, and if
the surrounding code already has one, rethrow anything matching
`isRedirectError` from `next/dist/client/components/redirect`.

**Delete this action's existing `await sendBookingNotifications(appointment.id)`
call (around line 166).** `createAppointment()` now does it for every path.
Leaving it would text and email the customer twice. Remove the import too if
nothing else in the file uses it — an unused import fails `next lint`, which
fails `next build`.

- [ ] **Step 2: Render the error**

The page is a server component, so read it from `searchParams` rather than
holding it in state. Add to the page signature and render above the form as a
full-bleed band, matching the flash-message idiom in `CLAUDE.md`:

```tsx
export default async function PortalNewAppointmentPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // ...
  {searchParams.error ? (
    <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {searchParams.error}
    </p>
  ) : null}
```

- [ ] **Step 3: Stop hardcoding the hours on the time input**

Replace `min="08:00" max="17:00"` with the shop's real span. The input cannot
vary per selected date without client JS, so use the widest published open and
close across the week — the server refusal is the real gate, and this is only
there to stop the obvious mistake:

```tsx
// The widest span the shop is ever open, as a hint on the picker. Per-day
// hours are enforced on the server by validateBookingTime(); an <input>
// cannot narrow its own min/max as the date changes without client JS, and
// a wrong-but-narrow hint refuses real bookings.
const spans = Object.values((config.businessHours as BusinessHours | null) ?? {}).filter(
  (d): d is { open: string; close: string } => d != null
);
const earliest = spans.length ? spans.map((d) => d.open).sort()[0] : "08:00";
const latest = spans.length ? spans.map((d) => d.close).sort().at(-1)! : "17:00";
```

Then `min={earliest} max={latest}` on the input.

- [ ] **Step 4: Verify by hand**

As a customer, try to book: a past date, a Sunday, 7am on a weekday, and one
hour from now. Each should re-render with a readable reason rather than
succeeding or erroring. Then book a valid slot and confirm it appears on
`/staff/appointments` with the preferred groomer attached.

- [ ] **Step 5: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 6: Commit**

```bash
git add app/portal/appointments/new/page.tsx
git commit -m "feat(portal): validate bookings against the shop's real hours"
```

---

### Task 6: Staff booking form delegates

**Files:**
- Modify: `app/staff/appointments/new/page.tsx` (around line 188, where
  `defaultAssignment()` is called today)

**Interfaces:**
- Consumes: `createAppointment` (Task 2).
- Produces: nothing new.

This form is the one path that already did the right thing. It delegates so
there is one copy of the logic, not because it is broken.

- [ ] **Step 1: Replace the action body**

Drop the local `defaultAssignment()` call — it now lives inside
`createAppointment`. Keep the action's existing `auth()` check (this file uses
`auth()` directly at two points, not `requireStaff()`; do not "tidy" that into
a guard as part of this task — it is a separate change and would bury the
delegation in an unrelated diff).

```ts
    const result = await createAppointment({
      customerId,
      petId,
      scheduledAt,
      serviceIds,
      // Staff choose explicitly on this form; passing undefined where they
      // left it blank lets the customer's preferred groomer fill it in.
      staffId: staffId || undefined,
      stationId: stationId || undefined,
      durationMins,
      visitNotes,
      needsKennel,
      // Staff book for ten minutes' time and for months out. The lead time
      // and booking window are customer promises, not diary rules.
      enforceCustomerRules: false,
      changedById: session.user.id,
    });
```

This form has no kennel warning today. Do not add one here — staff are not
refused (`enforceCustomerRules: false`), and a warning is a UI change that
belongs in its own commit.

**Delete this action's existing `await sendBookingNotifications(appointment.id)`
call (around line 211), and its import if now unused.** `createAppointment()`
sends for every path; keeping this one would notify the customer twice.

- [ ] **Step 2: Verify staff are not over-restricted**

Book, as staff: ten minutes from now (must succeed — customers cannot),
three months out (must succeed), and yesterday (must be refused — `PAST`
applies to everyone).

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add app/staff/appointments/new/page.tsx
git commit -m "refactor(staff): booking form delegates to createAppointment"
```

---

### Task 7: Confirm no creation path was missed

**Files:** none — this is a verification task.

- [ ] **Step 1: Search for stragglers**

Run:

```bash
grep -rn "appointment.create" app lib prisma --include=*.ts --include=*.tsx \
  | grep -v "lib/create-appointment.ts" | grep -v "prisma/demo.ts" | grep -v "prisma/seed.ts"
```

Expected: **no output**. `prisma/demo.ts` and `prisma/seed.ts` are excluded on
purpose — they create history in the past and must not be validated against
the clock.

If anything else appears, it is a fifth creation path nobody knew about. Route
it through `createAppointment` with the same judgement: customer-facing gets
`enforceCustomerRules: true`, staff-facing gets `false`.

Then check nobody notifies twice:

```bash
grep -rn "sendBookingNotifications" app lib | grep -v "lib/appointment-services.ts"
```

Expected: exactly one line, in `lib/create-appointment.ts`. Any hit under
`app/` is a double send — the customer gets two texts and two emails for one
booking.

- [ ] **Step 2: Full check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean. `npm run build` is included because prerendering catches
what `tsc` does not — a page reading `searchParams` that was previously static.

- [ ] **Step 3: Commit if anything changed**

```bash
git add -A
git commit -m "chore(booking): route remaining creation paths through createAppointment"
```

---

## Self-Review

**Spec coverage.** This plan closes three spec items: "Booking validation
refuses only what is definitely wrong" (Tasks 1–2, enforced at 3–6), business
hours at booking (Tasks 1, 5), and walk-in assignment (Task 4). The spec's
other six items belong to Plans 2–7 and are deliberately absent.

**Deliberately not built here:**
- Per-groomer concurrency caps — the spec refuses them, with a reason.
- Deposits — out of scope entirely.
- Any `SystemConfig` migration. Plan 1 uses `bookingLeadHours` and
  `bookingWindowDays`, which already exist. **There is no schema change in this
  plan**, so no `db:generate` and no migration.

**Known ceilings:**
- The portal's `<input type="time">` `min`/`max` is the week's widest span, not
  the selected day's. Narrowing it per-date needs client JS; the server refusal
  is the real gate. Add the JS when someone complains, not before.
- `kennelDemand()` is a whole-day figure, not a per-hour one — sharing depends
  on who turns up together, so it is headroom on the day rather than space the
  shop can promise. Refusing on `free <= 0` inherits that coarseness. A booking
  at 8am and one at 4pm count against the same pool even though the first dog
  is long gone. Tighten only if the shop reports being refused wrongly.
