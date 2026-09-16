# Card Payments at the Register — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The counter presses one button on a visit, the card reader takes the money, and the `Payment` row is written from the result — no amount typed twice and nothing to reconcile by hand.

**Architecture:** A register is a `Station` with `role = REGISTER` holding an opaque reader id. A `PaymentAttempt` row is written *before* the reader is touched, carrying the provider's charge id and a reused idempotency key. The open page polls; a scheduled job sweeps anything left pending. `settleAttempt()` is the only code that turns a provider outcome into a `Payment`, so both paths converge and it is idempotent. Providers sit behind a five-method adapter; Stripe is implemented, Clover is a registry entry that reports what it needs.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma/PostgreSQL, Vitest, `stripe` (new dependency), Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-15-card-payments-at-the-register-design.md](../specs/2026-09-15-card-payments-at-the-register-design.md) — read it alongside this plan; it carries the reasoning this plan only executes.

## Global Constraints

Every task's requirements implicitly include these.

- **Money is integer cents everywhere.** No floats. Format through [lib/pricing.ts](../../../lib/pricing.ts).
- **Never construct an API client at module scope.** `next build` evaluates route modules and `STRIPE_SECRET_KEY` is absent in CI. Build it lazily inside the call, the shape [lib/email.ts](../../../lib/email.ts) already uses.
- **The Stripe secret key is read from `process.env.STRIPE_SECRET_KEY` only.** Never a database column, never a form field, never logged.
- **Pin `apiVersion`** in the Stripe constructor.
- **Server actions and API routes re-authorise themselves.** Middleware does not cover `/api/*` and does not run for server actions. Every mutation calls a guard from [lib/auth-guards.ts](../../../lib/auth-guards.ts).
- **Route handlers and pages take `params` as a `Promise` and await it.** This is Next 16.
- **Tests are pure and offline.** Vitest, colocated `lib/*.test.ts`. No database, no network, no mocking frameworks — feed fixture objects to pure functions.
- **`npm run db:generate` after any `schema.prisma` edit**, before `tsc`.
- **`next lint` runs over test files**, so an unused import in one fails `next build`.
- **Keep `npx tsc --noEmit` and `npm test` green.** If `tsc` reports errors contradicting the config, delete `tsconfig.tsbuildinfo` and rerun.
- **One page, one `PageShell`.** Primitives from [components/ui/PageShell.tsx](../../../components/ui/PageShell.tsx).
- **All wall-clock work goes through `SHOP_TIMEZONE` helpers** in [lib/utils.ts](../../../lib/utils.ts).

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260915150000_card_payments_at_the_register/migration.sql` (generated)

**Interfaces:**
- Produces: `PaymentProvider` (`STRIPE` | `CLOVER`), `PaymentAttemptStatus` (`PENDING` | `SUCCEEDED` | `FAILED` | `CANCELED`), `PaymentAttempt` model, `Payment.provider`, `StationRole.REGISTER`, `Station.readerRef`, `Station.readerLivemode`, `SystemConfig.paymentProvider`. Every later task consumes these.

- [ ] **Step 1: Add the enums and the model to `prisma/schema.prisma`**

Add `REGISTER` to the existing `StationRole` enum (append, do not reorder — a Postgres enum's order is its declaration order):

```prisma
enum StationRole {
  GROOMER
  BATHING
  DRYING
  KENNEL
  REGISTER
}
```

Add beside the existing `PaymentMethod` enum:

```prisma
enum PaymentProvider {
  STRIPE
  CLOVER
}

enum PaymentAttemptStatus {
  PENDING
  SUCCEEDED
  FAILED
  CANCELED
}

model PaymentAttempt {
  id             String   @id @default(cuid())
  appointmentId  String
  /// The register it was sent to. Kept as null rather than deleted if the
  /// station goes away -- the money still happened.
  stationId      String?
  provider       PaymentProvider
  /// The provider's id for the charge -- a Stripe PaymentIntent. Unique, so a
  /// retry can never produce a second attempt against one charge.
  providerRef    String   @unique
  /// Generated before the first call and reused on every retry of this
  /// attempt. Stripe replays the first response for 24 hours, so a timeout
  /// during "create intent" cannot charge a customer twice.
  idempotencyKey String   @unique
  /// What was asked for, before any tip the reader collects.
  amountCents    Int
  status         PaymentAttemptStatus @default(PENDING)
  /// From the provider. Only a card error is safe to read out to a customer;
  /// `customerSafe` is decided at settle time and is not stored.
  failureCode    String?
  failureMessage String?
  /// The row it became. Unique -- one attempt settles at most once.
  paymentId      String?  @unique
  startedById    String
  createdAt      DateTime @default(now())
  settledAt      DateTime?

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  station     Station?    @relation(fields: [stationId], references: [id], onDelete: SetNull)
  payment     Payment?    @relation(fields: [paymentId], references: [id], onDelete: SetNull)
  startedBy   Staff       @relation(fields: [startedById], references: [id])

  @@index([appointmentId])
  @@index([status, createdAt])
  @@map("payment_attempts")
}
```

Add to `model Payment`:

```prisma
  /// Null for the cash and checks the counter still types in.
  provider      PaymentProvider?
  attempt       PaymentAttempt?
```

Add to `model Station`:

```prisma
  /// The paired reader's opaque device id. Stripe's `tmr_...`, Square's
  /// device_id and Clover's device id are all just strings.
  readerRef        String?
  /// Which mode it was paired in. A test reader is invisible to a live key,
  /// and `resource_missing` is not a message for somebody at a counter.
  readerLivemode   Boolean?
  paymentAttempts  PaymentAttempt[]
```

Add to `model SystemConfig`:

```prisma
  /// Which processor takes card payments. The key itself is an environment
  /// variable -- see docs/superpowers/specs/2026-09-15-card-payments-at-the-register-design.md
  paymentProvider PaymentProvider?
```

Add `paymentAttempts PaymentAttempt[]` to `model Appointment` and to `model Staff`.

- [ ] **Step 2: Generate the client and the migration**

Run:
```bash
npm run db:generate
npx prisma migrate dev --name card_payments_at_the_register --create-only
```
Rename the generated directory to `20260915150000_card_payments_at_the_register` so it sorts after `20260915140000_testimonials_reviewed`.

- [ ] **Step 3: Apply it and confirm the types exist**

Run:
```bash
npm run db:migrate:dev
npx tsc --noEmit
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(payments): attempt rows, a register role and a provider column"
```

---

### Task 2: `WORK_STATION_ROLES` — stop a register becoming a groom table

**Files:**
- Modify: `lib/stations.ts`
- Modify: `lib/stations.test.ts`
- Modify: `app/staff/page.tsx:74`
- Modify: `app/admin/staff/[id]/edit/page.tsx:37`
- Modify: `app/admin/staff/new/page.tsx:28`

**Interfaces:**
- Consumes: `StationRole.REGISTER` from Task 1.
- Produces: `WORK_STATION_ROLES: StationRole[]` and `isWorkStation(role)` from `lib/stations.ts`.

Three existing places spell "a place a pet stands" as `role !== KENNEL`. Adding a role to the enum silently makes registers groomable. This is the regression the new role could cause, so it gets a test.

- [ ] **Step 1: Write the failing test**

Add to `lib/stations.test.ts`:

```ts
import { StationRole } from "@prisma/client";
import { WORK_STATION_ROLES, isWorkStation, stationCapacity } from "./stations";

describe("WORK_STATION_ROLES", () => {
  it("is where a pet can stand, so a kennel and a register are not in it", () => {
    expect(WORK_STATION_ROLES).toEqual([
      StationRole.GROOMER,
      StationRole.BATHING,
      StationRole.DRYING,
    ]);
    expect(isWorkStation(StationRole.REGISTER)).toBe(false);
    expect(isWorkStation(StationRole.KENNEL)).toBe(false);
    expect(isWorkStation(StationRole.GROOMER)).toBe(true);
  });

  it("covers every role in the enum, so a new one is a decision rather than a default", () => {
    const accounted = [...WORK_STATION_ROLES, StationRole.KENNEL, StationRole.REGISTER];
    expect(new Set(accounted).size).toBe(Object.values(StationRole).length);
  });

  it("gives a register no capacity — no pet ever stands at one", () => {
    expect(stationCapacity({ role: StationRole.REGISTER })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/stations.test.ts`
Expected: FAIL — `WORK_STATION_ROLES` is not exported.

- [ ] **Step 3: Add the constant and the capacity guard**

In `lib/stations.ts`:

```ts
/**
 * Where a pet can physically stand.
 *
 * Several screens used to spell this `role !== KENNEL`, which quietly became
 * wrong the day a register joined the enum. Naming it once means a new role
 * has to be considered rather than inherited.
 */
export const WORK_STATION_ROLES: StationRole[] = [
  StationRole.GROOMER,
  StationRole.BATHING,
  StationRole.DRYING,
];

export function isWorkStation(role: StationRole): boolean {
  return WORK_STATION_ROLES.includes(role);
}
```

In `stationCapacity()`, before the kennel branch:

```ts
  // A register is a place a card is tapped, not a place a pet stands.
  if (station.role === StationRole.REGISTER) return 0;
```

Add `REGISTER: "Register"` to `STATION_NAME_PREFIX`, so `nextStationName()` yields `Register 1`.

In [lib/utils.ts](../../../lib/utils.ts), add `REGISTER: "Register"` to `formatStationRole()`'s map and a badge class to `stationRoleBadgeClass()` — both are keyed `Record<string, string>`, so a missing role falls through to the raw `REGISTER` rather than failing to compile.

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/stations.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the three `!== KENNEL` filters**

`app/staff/page.tsx:74`:
```ts
const workStations = stations.filter((s) => isWorkStation(s.role));
```

`app/admin/staff/[id]/edit/page.tsx:37` and `app/admin/staff/new/page.tsx:28` — the default-station dropdowns:
```ts
where: { isActive: true, role: { in: WORK_STATION_ROLES } },
```

Add the imports from `@/lib/stations` in each file.

- [ ] **Step 6: Verify nothing else means "work station"**

Run:
```bash
grep -rn "StationRole.KENNEL" --include="*.ts" --include="*.tsx" app lib components | grep -v node_modules
```
Every remaining hit must be genuinely *about kennels* (the kennel grid, the kiosk's kennel board, the stations page's kennel section), not a stand-in for "not a work station". Fix any that are.

- [ ] **Step 7: Run everything and commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add lib/stations.ts lib/stations.test.ts app/staff/page.tsx app/admin/staff
git commit -m "refactor(stations): name the roles a pet can stand at"
```

---

### Task 3: The provider seam

**Files:**
- Create: `lib/payments/types.ts`
- Create: `lib/payments/clover.ts`
- Create: `lib/payments/index.ts`
- Create: `lib/payments/providers.test.ts`

**Interfaces:**
- Consumes: `PaymentProvider` from Task 1.
- Produces: `ChargeRequest`, `ChargeOutcome`, `ReaderInfo`, `PaymentProviderAdapter` from `lib/payments/types.ts`; `PAYMENT_PROVIDERS`, `adapterFor(provider)`, `activeProvider(provider)` from `lib/payments/index.ts`. Tasks 4–11 consume these names.

- [ ] **Step 1: Write the types**

`lib/payments/types.ts`:

```ts
import type { PaymentProvider } from "@prisma/client";

/**
 * What a processor has to be able to do, and nothing more.
 *
 * Five methods, because that is what pushing a charge to a reader needs. The
 * seam exists so the attempt row and the Payment row never learn whose JSON
 * they came from -- see the spec for which processors fit behind it and which
 * cannot be reached from a server at all.
 */

export interface ChargeRequest {
  readerRef: string;
  /** What the visit owes, before any tip the reader collects. */
  amountCents: number;
  /** What a percentage tip is calculated on -- the groom, not the surcharge. */
  tipEligibleCents: number;
  /** Shown on the reader: the pet and the shop. */
  description: string;
  /** Reused on every retry of one attempt. */
  idempotencyKey: string;
  /**
   * An existing charge to drive again rather than create.
   *
   * A declined card leaves the intent alive and payable, and Stripe's
   * double-charge guidance is to reuse it rather than open a second one.
   */
  existingRef?: string;
}

export type ChargeOutcome =
  | { status: "PENDING" }
  | { status: "SUCCEEDED"; amountCents: number; tipCents: number; reference: string }
  | {
      status: "FAILED" | "CANCELED";
      code: string;
      message: string;
      /** True only for a card error. Anything else is staff-facing. */
      customerSafe: boolean;
    };

export interface ReaderInfo {
  id: string;
  label: string;
  /** The provider's own word: "online", "offline". Shown, not parsed. */
  status: string;
  livemode: boolean;
}

export interface PaymentProviderAdapter {
  key: PaymentProvider;
  label: string;
  /**
   * What is missing, or null when live. The same shape as `needs` in
   * lib/features.ts: say why rather than showing a switch that does nothing.
   */
  needs(): string | null;
  startCharge(request: ChargeRequest): Promise<{ providerRef: string }>;
  pollCharge(providerRef: string): Promise<ChargeOutcome>;
  cancelCharge(readerRef: string, providerRef: string): Promise<void>;
  listReaders(): Promise<ReaderInfo[]>;
}
```

- [ ] **Step 2: Write the failing test**

`lib/payments/providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PaymentProvider } from "@prisma/client";
import { PAYMENT_PROVIDERS, adapterFor, activeProvider } from "./index";

describe("the provider registry", () => {
  it("declares every provider in the enum", () => {
    expect(Object.keys(PAYMENT_PROVIDERS).sort()).toEqual(Object.values(PaymentProvider).sort());
  });

  it("says what Clover needs rather than offering a dead switch", () => {
    const needs = adapterFor(PaymentProvider.CLOVER).needs();
    expect(needs).toMatch(/Clover app/i);
  });

  it("is not live when no provider is chosen", () => {
    expect(activeProvider(null)).toBeNull();
  });

  it("is not live when the chosen provider is missing its configuration", () => {
    expect(activeProvider(PaymentProvider.CLOVER)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run lib/payments/providers.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 4: Write the Clover entry**

`lib/payments/clover.ts`:

```ts
import { PaymentProvider } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";

/**
 * Clover, declared and not implemented.
 *
 * REST Pay Display can push a charge to a Flex, Mini or Compact, but not
 * before somebody publishes a Clover app, obtains a Remote App ID and takes
 * the merchant through OAuth. That is not a key a shop can paste, so the
 * honest thing is to name the obstacle. `needs()` is non-null, so nothing
 * below it is reachable.
 */

const notImplemented = (): never => {
  throw new Error("Clover is declared but not implemented — see needs().");
};

export const cloverAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.CLOVER,
  label: "Clover",
  needs: () =>
    "a published Clover app, a Remote App ID and merchant OAuth — Clover cannot be configured from this screen",
  startCharge: notImplemented,
  pollCharge: notImplemented,
  cancelCharge: notImplemented,
  listReaders: notImplemented,
};
```

- [ ] **Step 5: Write the registry**

`lib/payments/index.ts`:

```ts
import { PaymentProvider } from "@prisma/client";
import { cloverAdapter } from "./clover";
import { stripeAdapter } from "./stripe";
import type { PaymentProviderAdapter } from "./types";

export * from "./types";

/** Every processor, declared once — the same rule as the feature registry. */
export const PAYMENT_PROVIDERS: Record<PaymentProvider, PaymentProviderAdapter> = {
  [PaymentProvider.STRIPE]: stripeAdapter,
  [PaymentProvider.CLOVER]: cloverAdapter,
};

export function adapterFor(provider: PaymentProvider): PaymentProviderAdapter {
  return PAYMENT_PROVIDERS[provider];
}

/**
 * The adapter a charge may actually go through, or null.
 *
 * Null covers both "the shop has not chosen one" and "the one it chose is
 * missing its configuration", because a caller can do nothing useful with
 * either.
 */
export function activeProvider(provider: PaymentProvider | null): PaymentProviderAdapter | null {
  if (!provider) return null;
  const adapter = adapterFor(provider);
  return adapter.needs() === null ? adapter : null;
}
```

Task 4 writes `./stripe`. To keep this task's test runnable now, create `lib/payments/stripe.ts` with only:

```ts
import { PaymentProvider } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";

export const stripeAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.STRIPE,
  label: "Stripe Terminal",
  needs: () => (process.env.STRIPE_SECRET_KEY ? null : "STRIPE_SECRET_KEY is not set"),
  startCharge: async () => { throw new Error("not yet implemented"); },
  pollCharge: async () => { throw new Error("not yet implemented"); },
  cancelCharge: async () => { throw new Error("not yet implemented"); },
  listReaders: async () => { throw new Error("not yet implemented"); },
};
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run lib/payments/providers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/payments
git commit -m "feat(payments): one seam, two processors, one of them honest about what it needs"
```

---

### Task 4: The Stripe adapter

**Files:**
- Modify: `package.json` (add `stripe`)
- Modify: `lib/payments/stripe.ts`
- Create: `lib/payments/stripe.test.ts`

**Interfaces:**
- Consumes: `ChargeRequest`, `ChargeOutcome`, `PaymentProviderAdapter` from Task 3.
- Produces: `outcomeFromIntent(intent: IntentShape): ChargeOutcome` and `IntentShape` from `lib/payments/stripe.ts`. Task 5 tests against the same outcome shape.

The mapping from a PaymentIntent to a `ChargeOutcome` is the part that can be wrong in a way money notices, so it is a pure function with fixtures. The HTTP calls around it are not tested.

- [ ] **Step 1: Install the dependency**

Run: `npm install stripe`

- [ ] **Step 2: Write the failing test**

`lib/payments/stripe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { outcomeFromIntent, type IntentShape } from "./stripe";

const succeeded = (over: Partial<IntentShape> = {}): IntentShape => ({
  status: "succeeded",
  amount: 9_000,
  amount_details: { tip: { amount: 1_000 } },
  latest_charge: {
    payment_method_details: { card_present: { brand: "visa", last4: "4242" } },
  },
  ...over,
});

describe("outcomeFromIntent", () => {
  it("takes the tip out of the total without changing the total", () => {
    // The reader collected $80 of groom and a $10 tip. `amount` is the whole
    // $90 -- which is what Payment.amountCents has always meant.
    expect(outcomeFromIntent(succeeded())).toEqual({
      status: "SUCCEEDED",
      amountCents: 9_000,
      tipCents: 1_000,
      reference: "Visa ••4242",
    });
  });

  it("reads no tip as zero, whether the reader offered one or not", () => {
    expect(outcomeFromIntent(succeeded({ amount_details: { tip: { amount: 0 } } })))
      .toMatchObject({ tipCents: 0 });
    expect(outcomeFromIntent(succeeded({ amount_details: null })))
      .toMatchObject({ tipCents: 0 });
    expect(outcomeFromIntent(succeeded({ amount_details: { tip: null } })))
      .toMatchObject({ tipCents: 0 });
  });

  it("still settles when the card details did not come back", () => {
    expect(outcomeFromIntent(succeeded({ latest_charge: null })))
      .toMatchObject({ status: "SUCCEEDED", reference: "Card" });
  });

  it("is pending while the customer is still holding their wallet", () => {
    for (const status of ["requires_confirmation", "requires_capture", "processing"]) {
      expect(outcomeFromIntent({ status, amount: 9_000 })).toEqual({ status: "PENDING" });
    }
  });

  it("reports a decline in words the counter can read out", () => {
    expect(
      outcomeFromIntent({
        status: "requires_payment_method",
        amount: 9_000,
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Your card has insufficient funds.",
        },
      })
    ).toEqual({
      status: "FAILED",
      code: "card_declined",
      message: "Your card has insufficient funds.",
      customerSafe: true,
    });
  });

  it("keeps our own errors away from the customer", () => {
    expect(
      outcomeFromIntent({
        status: "requires_payment_method",
        amount: 9_000,
        last_payment_error: { type: "invalid_request_error", code: "x", message: "bad param" },
      })
    ).toMatchObject({ customerSafe: false });
  });

  it("treats a fresh intent with no error as pending, not failed", () => {
    // requires_payment_method is also the state before anyone taps anything.
    expect(outcomeFromIntent({ status: "requires_payment_method", amount: 9_000 }))
      .toEqual({ status: "PENDING" });
  });

  it("reports a cancellation as its own thing", () => {
    expect(outcomeFromIntent({ status: "canceled", amount: 9_000 })).toMatchObject({
      status: "CANCELED",
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run lib/payments/stripe.test.ts`
Expected: FAIL — `outcomeFromIntent` is not exported.

- [ ] **Step 4: Write the adapter**

Replace `lib/payments/stripe.ts`:

```ts
import Stripe from "stripe";
import { PaymentProvider } from "@prisma/client";
import type { ChargeOutcome, ChargeRequest, PaymentProviderAdapter, ReaderInfo } from "./types";

/**
 * Stripe Terminal, server-driven.
 *
 * The app never sees a card: the reader talks to Stripe, and what comes back
 * is an amount, a tip and four digits. `outcomeFromIntent` is the only part
 * that can be wrong in a way money notices, so it is pure and tested; the
 * calls around it are three lines each.
 */

// Pinned deliberately: stripe-node otherwise floats to whatever was current
// when the package was published, and npm update would move the money path.
const API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

/**
 * Built per call, never at module scope -- `next build` evaluates route
 * modules and the key is absent in CI. Same shape as lib/email.ts.
 */
function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: API_VERSION });
}

/** Only what we read. The real object has several hundred fields. */
export interface IntentShape {
  status: string;
  amount: number;
  amount_details?: { tip?: { amount?: number | null } | null } | null;
  latest_charge?: {
    payment_method_details?: {
      card_present?: { brand?: string | null; last4?: string | null } | null;
    } | null;
  } | null;
  last_payment_error?: { type?: string; code?: string; message?: string } | null;
}

function reference(intent: IntentShape): string {
  const card = intent.latest_charge?.payment_method_details?.card_present;
  if (!card?.last4) return "Card";
  const brand = card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} ••${card.last4}`;
}

/**
 * A PaymentIntent's status, as something the counter can act on.
 *
 * `requires_payment_method` is two different situations wearing one word: a
 * fresh intent nobody has tapped yet, and one whose card was declined. The
 * error is what tells them apart, which is why a missing error reads as
 * pending rather than as a failure.
 */
export function outcomeFromIntent(intent: IntentShape): ChargeOutcome {
  if (intent.status === "succeeded") {
    return {
      status: "SUCCEEDED",
      // `amount` is tip-inclusive after confirmation, which is exactly what
      // Payment.amountCents has always meant.
      amountCents: intent.amount,
      tipCents: intent.amount_details?.tip?.amount ?? 0,
      reference: reference(intent),
    };
  }

  if (intent.status === "canceled") {
    return {
      status: "CANCELED",
      code: "canceled",
      message: "The payment was cancelled.",
      customerSafe: true,
    };
  }

  const error = intent.last_payment_error;
  if (intent.status === "requires_payment_method" && error) {
    return {
      status: "FAILED",
      code: error.code ?? "payment_failed",
      message: error.message ?? "The payment failed.",
      // Stripe's own rule: a card error is for the cardholder, anything else
      // is ours.
      customerSafe: error.type === "card_error",
    };
  }

  return { status: "PENDING" };
}

export const stripeAdapter: PaymentProviderAdapter = {
  key: PaymentProvider.STRIPE,
  label: "Stripe Terminal",

  needs: () =>
    process.env.STRIPE_SECRET_KEY
      ? null
      : "STRIPE_SECRET_KEY is not set on the server — see DEPLOY.md",

  async startCharge(request: ChargeRequest) {
    const stripe = client();

    // The idempotency key belongs to the attempt, so a retry after a timeout
    // returns the first intent rather than creating a second one.
    const intent = request.existingRef
      ? await stripe.paymentIntents.retrieve(request.existingRef)
      : await stripe.paymentIntents.create(
          {
            amount: request.amountCents,
            currency: "usd",
            payment_method_types: ["card_present"],
            capture_method: "automatic",
            description: request.description,
          },
          { idempotencyKey: request.idempotencyKey }
        );

    await stripe.terminal.readers.processPaymentIntent(
      request.readerRef,
      {
        payment_intent: intent.id,
        process_config: {
          enable_customer_cancellation: true,
          // A percentage tip is on the groom, not on a matting surcharge.
          tipping: { amount_eligible: request.tipEligibleCents },
        },
      },
      { idempotencyKey: `${request.idempotencyKey}-process` }
    );

    return { providerRef: intent.id };
  },

  async pollCharge(providerRef: string) {
    const intent = await client().paymentIntents.retrieve(providerRef, {
      expand: ["latest_charge"],
    });
    return outcomeFromIntent(intent as unknown as IntentShape);
  },

  async cancelCharge(readerRef: string, providerRef: string) {
    const stripe = client();
    // Reset the reader first; cancelling the intent while the reader still
    // holds it leaves the screen up in the lobby.
    await stripe.terminal.readers.cancelAction(readerRef);
    await stripe.paymentIntents.cancel(providerRef);
  },

  async listReaders(): Promise<ReaderInfo[]> {
    const readers = await client().terminal.readers.list({ limit: 100 });
    return readers.data.map((reader) => ({
      id: reader.id,
      label: reader.label ?? reader.id,
      status: reader.status ?? "unknown",
      livemode: reader.livemode,
    }));
  },
};
```

If `API_VERSION` does not typecheck, use the exact string in `node_modules/stripe/API_VERSION` — the installed library's types encode one version and disagreeing with it is a compile error.

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/payments/stripe.test.ts`
Expected: PASS, all nine cases.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add package.json package-lock.json lib/payments/stripe.ts lib/payments/stripe.test.ts
git commit -m "feat(payments): drive a Stripe Terminal reader from the server"
```

---

### Task 5: `settleAttempt()` — the one way a Payment is written

**Files:**
- Create: `lib/payments/settle.ts`
- Create: `lib/payments/settle.test.ts`

**Interfaces:**
- Consumes: `ChargeOutcome` (Task 3), `PaymentAttempt` (Task 1).
- Produces: `attemptStatusFor(outcome)`, `paymentFromOutcome(outcome)` and `settleAttempt(attemptId): Promise<PaymentAttemptStatus>` from `lib/payments/settle.ts`. Tasks 6 and 7 both call `settleAttempt`.

- [ ] **Step 1: Write the failing test**

`lib/payments/settle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PaymentAttemptStatus } from "@prisma/client";
import { attemptStatusFor, paymentFromOutcome } from "./settle";

describe("attemptStatusFor", () => {
  it("maps each outcome onto the column it is stored in", () => {
    expect(attemptStatusFor({ status: "PENDING" })).toBe(PaymentAttemptStatus.PENDING);
    expect(
      attemptStatusFor({ status: "SUCCEEDED", amountCents: 100, tipCents: 0, reference: "Card" })
    ).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(
      attemptStatusFor({ status: "FAILED", code: "c", message: "m", customerSafe: true })
    ).toBe(PaymentAttemptStatus.FAILED);
    expect(
      attemptStatusFor({ status: "CANCELED", code: "c", message: "m", customerSafe: true })
    ).toBe(PaymentAttemptStatus.CANCELED);
  });
});

describe("paymentFromOutcome", () => {
  it("writes a Payment only for money that actually moved", () => {
    expect(paymentFromOutcome({ status: "PENDING" })).toBeNull();
    expect(
      paymentFromOutcome({ status: "FAILED", code: "c", message: "m", customerSafe: true })
    ).toBeNull();
  });

  it("carries the total and the tip across unchanged", () => {
    expect(
      paymentFromOutcome({
        status: "SUCCEEDED",
        amountCents: 9_000,
        tipCents: 1_000,
        reference: "Visa ••4242",
      })
    ).toEqual({
      method: "CARD",
      amountCents: 9_000,
      tipCents: 1_000,
      reference: "Visa ••4242",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/payments/settle.test.ts`
Expected: FAIL — cannot resolve `./settle`.

- [ ] **Step 3: Write it**

`lib/payments/settle.ts`:

```ts
import { PaymentAttemptStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adapterFor } from "./index";
import type { ChargeOutcome } from "./types";

/**
 * The only place a provider outcome becomes a Payment row.
 *
 * The page poll and the sweep job both land here, which is the point: a
 * charge that succeeded while the counter's tab was closed is settled by the
 * job through the same code that would have settled it on screen. Idempotent
 * on two unique columns -- `PaymentAttempt.paymentId` and
 * `PaymentAttempt.providerRef` -- so settling twice writes one Payment.
 */

export function attemptStatusFor(outcome: ChargeOutcome): PaymentAttemptStatus {
  return PaymentAttemptStatus[outcome.status];
}

export interface PaymentData {
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  reference: string;
}

/** Null unless money moved. A decline is a fact about the attempt, not a Payment. */
export function paymentFromOutcome(outcome: ChargeOutcome): PaymentData | null {
  if (outcome.status !== "SUCCEEDED") return null;
  return {
    method: PaymentMethod.CARD,
    amountCents: outcome.amountCents,
    tipCents: outcome.tipCents,
    reference: outcome.reference,
  };
}

export async function settleAttempt(attemptId: string): Promise<PaymentAttemptStatus> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error(`No payment attempt ${attemptId}`);
  // Already finished. Nothing to ask the provider and nothing to write.
  if (attempt.status !== PaymentAttemptStatus.PENDING) return attempt.status;

  const outcome = await adapterFor(attempt.provider).pollCharge(attempt.providerRef);
  const status = attemptStatusFor(outcome);
  if (status === PaymentAttemptStatus.PENDING) return status;

  const payment = paymentFromOutcome(outcome);

  await prisma.$transaction(async (tx) => {
    /*
     * The guard is the `status: PENDING` in the where clause: two settles
     * racing (the page poll and the sweep job on the same second) means the
     * second updates nothing, so only one Payment is ever created.
     */
    const claimed = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
      data: {
        status,
        settledAt: new Date(),
        failureCode: outcome.status === "SUCCEEDED" ? null : outcome.code,
        failureMessage: outcome.status === "SUCCEEDED" ? null : outcome.message,
      },
    });
    if (claimed.count === 0 || !payment) return;

    const created = await tx.payment.create({
      data: {
        appointmentId: attempt.appointmentId,
        provider: attempt.provider,
        takenById: attempt.startedById,
        ...payment,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { paymentId: created.id },
    });
  });

  return status;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/payments/settle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/payments/settle.ts lib/payments/settle.test.ts
git commit -m "feat(payments): one function turns an outcome into a Payment"
```

---

### Task 6: Starting, polling and cancelling a charge

**Files:**
- Create: `app/api/payments/attempts/route.ts`
- Create: `app/api/payments/attempts/[id]/route.ts`
- Create: `app/api/payments/attempts/[id]/cancel/route.ts`

**Interfaces:**
- Consumes: `activeProvider` (Task 3), `settleAttempt` (Task 5), `ticketFromRow`/`TICKET_SELECT` from [lib/ticket.ts](../../../lib/ticket.ts).
- Produces: `POST /api/payments/attempts` → `{ attemptId, status }`; `GET /api/payments/attempts/[id]` → `{ status, message?, customerSafe? }`; `POST /api/payments/attempts/[id]/cancel` → `{ status }`. Task 8's client component calls all three.

Route handlers rather than server actions: the counter needs the attempt id back so it can poll, which a redirecting action cannot give it. Every handler re-checks the session itself — middleware does not cover `/api/*`.

- [ ] **Step 1: Write the start handler**

`app/api/payments/attempts/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PaymentAttemptStatus, StationRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { activeProvider } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { TICKET_SELECT, ticketFromRow } from "@/lib/ticket";

/**
 * Start a charge on a register's reader.
 *
 * The attempt row is written before the reader is touched, so a charge that
 * succeeds can never exist with nothing in the database pointing at it. The
 * amount is read from the visit here and never taken from the request: a
 * total posted by a browser is a total somebody can edit.
 */

const Body = z.object({
  appointmentId: z.string().min(1),
  stationId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const config = await getConfig();
  if (!isEnabled(config, "featureCounterPayments")) {
    return NextResponse.json({ error: "Counter payments are off" }, { status: 403 });
  }

  const adapter = activeProvider(config.paymentProvider);
  if (!adapter) {
    return NextResponse.json({ error: "No card processor is configured" }, { status: 409 });
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const [visit, station] = await Promise.all([
    prisma.appointment.findUnique({
      where: { id: parsed.data.appointmentId },
      select: { id: true, pet: { select: { name: true } }, ...TICKET_SELECT },
    }),
    prisma.station.findUnique({
      where: { id: parsed.data.stationId },
      select: { id: true, name: true, role: true, readerRef: true, readerLivemode: true },
    }),
  ]);

  if (!visit) return NextResponse.json({ error: "No such visit" }, { status: 404 });
  if (!station || station.role !== StationRole.REGISTER || !station.readerRef) {
    return NextResponse.json({ error: "That is not a paired register" }, { status: 400 });
  }

  /*
   * A reader registered under a test key is invisible to a live one. Catch it
   * here: `resource_missing` is not a message for somebody at a counter with
   * a customer in front of them.
   */
  const liveKey = !process.env.STRIPE_SECRET_KEY?.includes("_test_");
  if (station.readerLivemode !== null && station.readerLivemode !== liveKey) {
    return NextResponse.json(
      {
        error: `${station.name} was paired in ${station.readerLivemode ? "live" : "test"} mode and the current key is ${liveKey ? "live" : "test"}. Pair it again.`,
      },
      { status: 409 }
    );
  }

  // `ticketFromRow` is the pair to TICKET_SELECT -- never re-spell the sum here.
  const ticket = ticketFromRow(visit);
  if (ticket.balanceCents <= 0) {
    return NextResponse.json({ error: "Nothing left to pay" }, { status: 409 });
  }

  const idempotencyKey = randomUUID();

  /*
   * A card that was declined leaves its intent payable. Stripe's double-charge
   * guidance is to present the next card against the same one, so a retry at
   * the same amount reuses it; anything else starts fresh.
   */
  const declined = await prisma.paymentAttempt.findFirst({
    where: {
      appointmentId: visit.id,
      status: PaymentAttemptStatus.FAILED,
      failureCode: { not: null },
      amountCents: ticket.balanceCents,
    },
    orderBy: { createdAt: "desc" },
    select: { providerRef: true },
  });

  const { providerRef } = await adapter.startCharge({
    existingRef: declined?.providerRef,
    readerRef: station.readerRef,
    amountCents: ticket.balanceCents,
    // The tip is on the groom, not on a surcharge found on the table -- and
    // never more than is actually being charged, on a part-paid visit.
    tipEligibleCents: Math.min(ticket.serviceCents, ticket.balanceCents),
    description: `${visit.pet.name} — ${config.shopName}`,
    idempotencyKey,
  });

  /*
   * `providerRef` is unique, so a reused intent updates its attempt back to
   * PENDING rather than opening a second row against one charge -- which is
   * the invariant that makes settling idempotent.
   */
  const attempt = await prisma.paymentAttempt.upsert({
    where: { providerRef },
    update: {
      status: PaymentAttemptStatus.PENDING,
      failureCode: null,
      failureMessage: null,
      settledAt: null,
      startedById: session.user.id,
    },
    create: {
      appointmentId: visit.id,
      stationId: station.id,
      provider: adapter.key,
      providerRef,
      idempotencyKey,
      amountCents: ticket.balanceCents,
      startedById: session.user.id,
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ attemptId: attempt.id, status: attempt.status });
}
```

**Note the ordering problem and its answer:** `startCharge` runs before the attempt row exists, because the row needs `providerRef`. If the process dies between them the charge is orphaned. The idempotency key is generated first and is the recovery: re-running with the same key returns the same intent rather than charging again. Task 12 records this as the one known hole and what closes it.

- [ ] **Step 2: Write the poll handler**

`app/api/payments/attempts/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { PaymentAttemptStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { settleAttempt } from "@/lib/payments/settle";
import { prisma } from "@/lib/prisma";

/** Where the open page asks "has it gone through yet". */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const status = await settleAttempt(id);
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id },
    select: { failureCode: true, failureMessage: true, appointmentId: true },
  });

  return NextResponse.json({
    status,
    appointmentId: attempt?.appointmentId ?? null,
    message: status === PaymentAttemptStatus.PENDING ? null : attempt?.failureMessage ?? null,
  });
}
```

- [ ] **Step 3: Write the cancel handler**

`app/api/payments/attempts/[id]/cancel/route.ts`:

```ts
import { NextResponse } from "next/server";
import { PaymentAttemptStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { adapterFor } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

/**
 * Take the charge off the reader.
 *
 * A cancel that fails is not an error worth showing: the customer may have
 * tapped in the same second, in which case the next poll settles it and the
 * money is real. Let the poll decide.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id },
    select: { providerRef: true, provider: true, status: true, station: { select: { readerRef: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "No such attempt" }, { status: 404 });
  if (attempt.status !== PaymentAttemptStatus.PENDING) {
    return NextResponse.json({ status: attempt.status });
  }

  const readerRef = attempt.station?.readerRef;
  if (readerRef) {
    try {
      await adapterFor(attempt.provider).cancelCharge(readerRef, attempt.providerRef);
    } catch (error) {
      console.error("cancel failed, leaving it to the poll", error);
    }
  }

  return NextResponse.json({ status: PaymentAttemptStatus.PENDING });
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit && npm run lint
git add app/api/payments
git commit -m "feat(payments): start, poll and cancel a charge from the counter"
```

---

### Task 7: The sweep job

**Files:**
- Create: `lib/jobs/payment-sweep.ts`
- Create: `lib/jobs/payment-sweep.test.ts`
- Modify: `lib/jobs/index.ts`

**Interfaces:**
- Consumes: `ScheduledJob`, `JobResult` from [lib/jobs/types.ts](../../../lib/jobs/types.ts); `settleAttempt` (Task 5).
- Produces: `sweepCutoff(now)` and `paymentSweepJob` from `lib/jobs/payment-sweep.ts`.

This is what makes the design safe without a webhook. It matters more for a second provider than the first — Square warns of significant delay before a checkout completes, so the page poll times out there more often.

- [ ] **Step 1: Write the failing test**

`lib/jobs/payment-sweep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SWEEP_AFTER_MINS, sweepCutoff } from "./payment-sweep";

describe("sweepCutoff", () => {
  it("leaves a charge alone while somebody could still be tapping", () => {
    const now = new Date("2026-09-15T17:00:00Z");
    expect(sweepCutoff(now).toISOString()).toBe("2026-09-15T16:58:00.000Z");
    expect(SWEEP_AFTER_MINS).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/jobs/payment-sweep.test.ts`
Expected: FAIL — cannot resolve `./payment-sweep`.

- [ ] **Step 3: Write the job**

`lib/jobs/payment-sweep.ts`:

```ts
import { PaymentAttemptStatus } from "@prisma/client";
import { settleAttempt } from "@/lib/payments/settle";
import { prisma } from "@/lib/prisma";
import type { JobResult, ScheduledJob } from "./types";

/**
 * What the webhook would have caught, and one thing it would not.
 *
 * The counter's page polls a charge for ninety seconds, which covers a
 * customer finding their card. It does not cover the tab being closed, the
 * container restarting mid-tap, or a processor that takes its time. This
 * settles those through the same `settleAttempt` the page uses, so there is
 * no second way for a Payment row to come into existence.
 *
 * Stripe documents that a reader disconnecting mid-payment sends no webhook
 * at all -- so a sweep is needed whether or not one exists, and once it does
 * the webhook earns nothing but a public endpoint and a signing secret.
 */

/** Long enough that a customer still choosing a tip is not swept. */
export const SWEEP_AFTER_MINS = 2;

export function sweepCutoff(now: Date): Date {
  return new Date(now.getTime() - SWEEP_AFTER_MINS * 60_000);
}

async function run(now: Date): Promise<JobResult> {
  const stale = await prisma.paymentAttempt.findMany({
    where: { status: PaymentAttemptStatus.PENDING, createdAt: { lt: sweepCutoff(now) } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (stale.length === 0) return { status: "skipped", reason: "nothing pending" };

  let settled = 0;
  for (const attempt of stale) {
    try {
      const status = await settleAttempt(attempt.id);
      if (status !== PaymentAttemptStatus.PENDING) settled += 1;
    } catch (error) {
      // One unreachable charge must not stop the rest being recovered.
      console.error(`payment sweep: ${attempt.id}`, error);
    }
  }

  return {
    status: "ran",
    acted: settled,
    detail: `${settled} of ${stale.length} pending attempts settled`,
  };
}

export const paymentSweepJob: ScheduledJob = {
  name: "payment-sweep",
  blurb: "Settles card charges the counter's page did not see finish.",
  everyMins: 5,
  run,
};
```

- [ ] **Step 4: Register it**

`lib/jobs/index.ts`:

```ts
import { paymentSweepJob } from "./payment-sweep";
...
export const JOBS: ScheduledJob[] = [reminderJob, rebookingJob, paymentSweepJob];
```

- [ ] **Step 5: Run the tests and commit**

```bash
npx vitest run lib/jobs/payment-sweep.test.ts && npm test
git add lib/jobs
git commit -m "feat(payments): sweep the charges nobody watched finish"
```

---

### Task 8: Take payment, on the visit screen

**Files:**
- Create: `components/TakePayment.tsx`
- Modify: `components/Ticket.tsx`
- Modify: `app/staff/appointments/[id]/page.tsx`

**Interfaces:**
- Consumes: the three routes from Task 6.
- Produces: `<TakePayment appointmentId registers balanceCents />` where `registers: { id: string; name: string }[]`.

- [ ] **Step 1: Write the client component**

`components/TakePayment.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/pricing";

/**
 * The counter's button, and the ninety seconds after it.
 *
 * Polls rather than waits on a webhook, because the customer is standing
 * right there and the wait is bounded. What it does not catch -- the tab
 * being closed, the container restarting -- the sweep job settles, so
 * abandoning this screen loses nothing but the sight of it.
 */

type Phase = "idle" | "starting" | "waiting" | "done" | "error";

const POLL_MS = 2_000;
const GIVE_UP_MS = 90_000;

export function TakePayment({
  appointmentId,
  registers,
  balanceCents,
}: {
  appointmentId: string;
  registers: { id: string; name: string }[];
  balanceCents: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [stationId, setStationId] = useState(registers[0]?.id ?? "");
  const startedAt = useRef(0);

  useEffect(() => {
    if (phase !== "waiting" || !attemptId) return;

    const timer = setInterval(async () => {
      const response = await fetch(`/api/payments/attempts/${attemptId}`);
      const data = await response.json();

      if (data.status === "SUCCEEDED") {
        setPhase("done");
        setMessage(null);
        router.refresh();
        return;
      }
      if (data.status === "FAILED" || data.status === "CANCELED") {
        setPhase("error");
        setMessage(data.message ?? "The payment did not go through.");
        return;
      }
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        setPhase("error");
        // Not a failure: the charge may still land, and the sweep will file it.
        setMessage("Still waiting on the reader. This page has stopped watching — refresh in a minute.");
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [phase, attemptId, router]);

  async function start() {
    setPhase("starting");
    setMessage(null);
    const response = await fetch("/api/payments/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, stationId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setPhase("error");
      setMessage(data.error ?? "Could not start the payment.");
      return;
    }
    setAttemptId(data.attemptId);
    startedAt.current = Date.now();
    setPhase("waiting");
  }

  async function cancel() {
    if (attemptId) await fetch(`/api/payments/attempts/${attemptId}/cancel`, { method: "POST" });
    setPhase("idle");
    setAttemptId(null);
  }

  if (registers.length === 0) return null;

  return (
    <div className="rounded-lg bg-well border border-well-line p-3 space-y-2">
      {phase === "waiting" ? (
        <>
          <p className="text-sm font-semibold text-stone-900">
            Waiting for the card — {formatCents(balanceCents)}
          </p>
          <p className="text-xs text-stone-500">
            The reader is showing the amount. A tip is asked for there.
          </p>
          <button type="button" onClick={cancel} className="text-sm text-amber-700 underline">
            Cancel on the reader
          </button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {registers.length > 1 && (
            <select
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
            >
              {registers.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={start}
            disabled={phase === "starting"}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {phase === "starting" ? "Sending to the reader…" : `Take ${formatCents(balanceCents)} by card`}
          </button>
        </div>
      )}

      {phase === "done" && <p className="text-sm text-green-700">Paid. The ticket is settled.</p>}
      {message && <p className="text-sm text-amber-800">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Render it above the hand-entry form**

In `components/Ticket.tsx`, add to the props interface:

```ts
  registers?: { id: string; name: string }[];
```

and immediately above the `<form action={recordPayment}>` at line 146:

```tsx
{registers && registers.length > 0 && ticket.balanceCents > 0 && (
  <TakePayment
    appointmentId={appointmentId}
    registers={registers}
    balanceCents={ticket.balanceCents}
  />
)}
```

The hand-entry form stays exactly as it is — cash and checks still happen.

- [ ] **Step 3: Pass the registers in**

In `app/staff/appointments/[id]/page.tsx`, load them beside the other queries and pass to `<Ticket>`:

```ts
const registers = await prisma.station.findMany({
  where: { role: StationRole.REGISTER, isActive: true, readerRef: { not: null } },
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});
```

- [ ] **Step 4: Check it builds and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/TakePayment.tsx components/Ticket.tsx app/staff/appointments
git commit -m "feat(payments): one button on the visit, and the reader lights up"
```

---

### Task 9: Pairing a reader to a register

**Files:**
- Modify: `app/admin/stations/StationForm.tsx`
- Modify: `app/admin/stations/actions.ts`
- Modify: `app/admin/stations/[id]/edit/page.tsx`
- Modify: `app/admin/stations/new/page.tsx`

**Interfaces:**
- Consumes: `listReaders()` via `activeProvider` (Task 3), `Station.readerRef` (Task 1).
- Produces: a register's reader picker. No new exported names.

- [ ] **Step 1: Offer the readers on the form**

`StationForm.tsx` gains `readers?: ReaderInfo[]` and:

```tsx
const isRegister = role === StationRole.REGISTER;
```

When `isRegister`, render a `<select name="readerRef">` of `readers` — label, status and mode per option — instead of the kennel grid, with an empty option reading "Not paired yet". When the list is empty, render a line pointing at `/admin/payments` rather than an empty dropdown.

- [ ] **Step 2: Read it in the action**

In `app/admin/stations/actions.ts`, inside `parseStation`:

```ts
if (role === StationRole.REGISTER) {
  const readerRef = ((formData.get("readerRef") as string | null) ?? "").trim() || null;
  // Record the mode it was paired in: a test reader is invisible to a live key.
  const readerLivemode = readerRef
    ? !process.env.STRIPE_SECRET_KEY?.includes("_test_")
    : null;
  return { ...base, readerRef, readerLivemode };
}
```

Registers never get a kennel grid: the existing `role === KENNEL` branches already exclude them, so confirm `syncKennelGrid()` is not called for one.

- [ ] **Step 3: Load the readers on both pages**

In `new/page.tsx` and `[id]/edit/page.tsx`:

```ts
const adapter = activeProvider((await getConfig()).paymentProvider);
// A processor being down must not break the stations screen.
const readers = adapter ? await adapter.listReaders().catch(() => []) : [];
```

Pass `readers` to `<StationForm>`.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit && npm run lint
git add app/admin/stations
git commit -m "feat(stations): pair a reader to a register"
```

---

### Task 10: `/admin/payments`

**Files:**
- Create: `app/admin/payments/page.tsx`
- Modify: `components/BackOfficeShell.tsx` (`TECHNICAL_NAV`)

**Interfaces:**
- Consumes: `PAYMENT_PROVIDERS`, `activeProvider` (Task 3), `currentStaffIsAdmin` from [lib/staff-roles.ts](../../../lib/staff-roles.ts).

ADMIN only, the tier `/admin/notifications` sits at, and it redirects a manager itself — hiding the nav link is presentation.

- [ ] **Step 1: Write the page**

`app/admin/payments/page.tsx` — one `PageShell` titled **Card Payments**, `export const dynamic = "force-dynamic"`, `export const metadata = { title: "Card Payments" }`, and:

- A redirect: `if (!(await currentStaffIsAdmin())) redirect("/staff");`
- A provider band listing every entry in `PAYMENT_PROVIDERS` with its `needs()` rendered as "Not live: …", and a form selecting `SystemConfig.paymentProvider` (a server action calling `requireAdmin()`).
- A key band: whether `STRIPE_SECRET_KEY` is set, and which mode it is in — derived from the `_test_` substring, **never printing any part of the key**. Where it is unset, the hint says it is an environment variable set on the server and points at DEPLOY.md, because there is nothing to type here.
- A reader band: `listReaders()` output in a table (label, id, status, mode) with a link to `/admin/stations`, wrapped in `.catch()` so a processor outage renders a message rather than a stack trace.

- [ ] **Step 2: Add the nav row**

In `TECHNICAL_NAV`, after the notifications row:

```ts
{ href: "/admin/payments", label: "Card Payments" },
```

- [ ] **Step 3: Verify the gate by hand**

Sign in as a `MANAGER` who is not an `ADMIN`. The row must be absent from the sidebar, and visiting `/admin/payments` directly must land on `/staff`.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit && npm run lint
git add app/admin/payments components/BackOfficeShell.tsx
git commit -m "feat(payments): a screen that reports the processor rather than asking for a key"
```

---

### Task 11: The payments page learns about the reader

**Files:**
- Modify: `app/staff/payments/page.tsx`

- [ ] **Step 1: Add a provider line and a stuck-attempts band**

Below the `StatStrip`, a band naming the live provider and its paired registers, or "No card processor configured" linking to `/admin/payments`.

Then, when there are any, a band titled `Attempts needing a look (n)` listing today's `FAILED` attempts and any `PENDING` one older than `SWEEP_AFTER_MINS`, each with pet, register, amount, time and `failureMessage`. A jammed reader belongs on the screen that reports the day's money, not in a log.

Query:

```ts
const attention = await prisma.paymentAttempt.findMany({
  where: {
    createdAt: { gte: start, lt: end },
    OR: [
      { status: PaymentAttemptStatus.FAILED },
      { status: PaymentAttemptStatus.PENDING, createdAt: { lt: sweepCutoff(new Date()) } },
    ],
  },
  select: {
    id: true, amountCents: true, status: true, failureMessage: true, createdAt: true,
    station: { select: { name: true } },
    appointment: { select: { id: true, pet: { select: { name: true } } } },
  },
  orderBy: { createdAt: "desc" },
});
```

Render times through `formatShopTime` and money through `formatCents`. Follow the page's existing `PageSection` idiom — `padded={false}` with `bodyClassName="divide-y divide-stone-100"`.

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit && npm run lint
git add app/staff/payments/page.tsx
git commit -m "feat(payments): show the charges that need a person"
```

---

### Task 12: Documentation

**Files:**
- Modify: `DEPLOY.md`
- Modify: `CLAUDE.md`
- Modify: `.env.example` (if present)

- [ ] **Step 1: DEPLOY.md**

A **Card payments** section covering:

- `STRIPE_SECRET_KEY` as an environment variable, and why it is not a settings field: Stripe's guidance is that a secret key must not live in application storage. Use a **restricted** key (`rk_live_`) scoped to PaymentIntents write and Terminal write.
- The one-time Stripe Dashboard steps: create a Terminal **Location**, register each reader to it, set the tipping **Configuration** (percentages or smart-tip threshold — tips are not configured in this app).
- Rotation: replace the variable and restart the container. Reader ids survive rotation but **not** a move between test and live, which re-pairs every register.
- Testing without hardware: a sandbox key, a simulated reader (`registration_code: simulated-wpe`), and `present_payment_method` to simulate the tap.

- [ ] **Step 2: CLAUDE.md**

A section after "Analytics is a shop screen", in the file's voice, covering: the attempt row written before the reader is touched; `settleAttempt()` as the only path to a `Payment`; poll plus sweep and why there is no webhook; the key in the environment against the Twilio precedent; `WORK_STATION_ROLES`; and the reader-mode guard.

- [ ] **Step 3: Record the one known hole**

In the CLAUDE.md section, plainly: if the process dies between `startCharge` and the `create` that follows it, the charge exists with no attempt row. The idempotency key is generated first and reused, so re-running the same request returns the same intent rather than charging twice — but the recovery is manual, through the Stripe Dashboard. Closing it properly means writing the attempt first with a provisional `providerRef` and updating it after, which is a second write on every payment to cover a window measured in milliseconds. Not taken; written down.

- [ ] **Step 4: Full check and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add DEPLOY.md CLAUDE.md .env.example
git commit -m "docs(payments): how the register is set up, and the one hole in it"
```

---

## Manual verification (after Task 12)

Not automatable; do it before calling this done. Sandbox key, simulated reader.

- [ ] A successful tap writes one `Payment`, the ticket settles, the visit screen refreshes itself.
- [ ] A tip selected on the reader lands in `Payment.tipCents` and the total includes it.
- [ ] No tip selected gives `tipCents: 0` and still settles.
- [ ] A declined card shows the customer-safe message and leaves the balance owed.
- [ ] Cancelling from the app clears the reader.
- [ ] Cancelling on the reader lands as `CANCELED`.
- [ ] **Close the tab mid-payment, complete the tap, wait for the sweep** — the `Payment` appears without the page. This is the design's whole safety argument.
- [ ] A part payment leaves the visit on the payments page's "still owing" list.
- [ ] A register does not appear as a groom table on `/staff`, in the floor board, or in a staff member's default-station dropdown.
- [ ] Pairing a test reader and switching to a live key gives the mode message, not `resource_missing`.
