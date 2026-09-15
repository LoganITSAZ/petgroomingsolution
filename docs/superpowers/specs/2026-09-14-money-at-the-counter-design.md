# Money at the counter

**Date:** 2026-09-14
**Status:** approved design, not yet implemented

## Why

The app quotes prices and has never recorded one being paid. `/staff/analytics`
reports revenue off `AppointmentService.priceCents` — the **list** price of what
was booked — and says so on every screen, because that is all it has. The shop
cannot answer the two questions it asks at the end of every day: what did we
take, and who left without paying.

Three things are missing, and they are one screen apart:

1. The extra fees a groomer finds on the table. `Surcharge` has been a published
   range since it was written and nothing has ever attached one to a visit.
2. What the customer actually paid, and the tip.
3. The day's takings, and the finished visits with nothing against them.

## Decisions taken

Inherited verbatim from `docs/superpowers/specs/2026-09-13-shop-operations.md`,
which is still the shop's decision on all of this:

| Question | Decision |
|---|---|
| Does the app take payment? | No. The shop's Clover terminal does. `Payment` rows record something that happened elsewhere — no processor, no card data, no PCI surface. |
| Sales tax? | None on grooming. No `taxCents`, no product catalog. |
| Deposits? | Out of scope; impossible without integration. The `Payment` shape must not make them harder later. |
| The ticket | services + surcharges − tier discount − reward discount + tip. |
| Who adds a surcharge? | The groomer, from the station job aid as well as the visit screen. Matting is found an hour before anybody thinks about a total. |
| Is the published range binding? | No. A genuinely awful coat is charged above `maxCents`; the server stores what was charged and flags the override rather than refusing it. |
| Commission | Unchanged: the **list** price of the services a groomer finished. A groomer's pay must not move because the counter gave a discount. |

New decisions this design adds:

| Question | Decision |
|---|---|
| Is a tip a payment or a column on the visit? | A column on the payment. A tip is handed over with the money, and a split payment tips once. |
| Who does a tip belong to? | The groomer who finished the visit, shown beside their commission and never mixed into it. |
| Can a visit be part-paid? | Yes. The ticket carries a balance and the counter screen lists anything unsettled. Refusing a part payment would mean refusing what happened. |
| One flag or three? | One: `featureCounterPayments`. A shop that does not record money at this counter does not want two thirds of it. |

## Data model

```prisma
model AppointmentSurcharge {
  id            String  @id @default(cuid())
  appointmentId String
  /// The catalog row this came from, kept for reporting. Null once the shop
  /// deletes the published fee; `label` is what the counter reads out.
  surchargeId   String?
  label         String
  amountCents   Int
  /// Charged above the published range. The counter has to explain the number
  /// to an owner who was quoted something smaller, so the override is a fact
  /// on the row rather than something inferred later from a price list that
  /// has since changed.
  aboveRange    Boolean @default(false)
  note          String?
  /// Who found it. Same reason.
  addedById     String
  createdAt     DateTime @default(now())

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  surcharge   Surcharge?  @relation(fields: [surchargeId], references: [id], onDelete: SetNull)
  addedBy     Staff       @relation(fields: [addedById], references: [id])

  @@index([appointmentId])
  @@map("appointment_surcharges")
}

model Payment {
  id            String        @id @default(cuid())
  appointmentId String
  method        PaymentMethod
  /// What was handed over, tip included. The terminal's total, so it
  /// reconciles against Clover's batch without arithmetic.
  amountCents   Int
  tipCents      Int           @default(0)
  /// Clover's transaction id, free text. The only hook a future integration
  /// would need, and what a dispute is traced by.
  reference     String?
  note          String?
  takenById     String
  takenAt       DateTime      @default(now())

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  takenBy     Staff       @relation(fields: [takenById], references: [id])

  @@index([appointmentId])
  @@index([takenAt])
  @@map("payments")
}

enum PaymentMethod {
  CARD
  CASH
  CHECK
  OTHER
}
```

One setting, and it is not a threshold:

```prisma
featureCounterPayments Boolean @default(true)
```

`offMeans: "frozen"` — switched off, the tickets and payments already written
stay readable and nothing new is taken. Turning it off must never make the
shop's own books disappear.

## `lib/ticket.ts`

The whole sum, pure, with the queries at the bottom. Nothing about money is
allowed to live in a page.

```ts
export interface TicketInput {
  services: { priceCents: number | null }[];
  surcharges: { amountCents: number }[];
  tierDiscountCents: number;
  rewardDiscountCents: number;
  payments: { amountCents: number; tipCents: number }[];
}

export interface Ticket {
  serviceCents: number;
  surchargeCents: number;
  discountCents: number;
  /** What the customer owes for the work: services + surcharges − discounts. */
  dueCents: number;
  tipCents: number;
  /** Taken, tip included — the terminal's number. */
  paidCents: number;
  /** Positive is owed, negative is overpaid. Tips are not change owed. */
  balanceCents: number;
  settled: boolean;
}

export function ticketFor(input: TicketInput): Ticket;
```

Rules the tests hold it to:

- A null `priceCents` contributes nothing and does not poison the sum. The
  catalog allows an unpriced line and the counter still has to total the rest.
- Discounts never take a ticket below zero. A reward worth more than the visit
  is a free groom, not a credit the shop owes.
- `balanceCents = dueCents − (paidCents − tipCents)`. A tip is not payment for
  work, so tipping does not settle a balance, and a tip on a part-paid visit
  does not read as change owed.
- `settled` is `balanceCents <= 0`, so an overpayment reads as settled rather
  than as a second thing to chase.
- Every figure is cents and an integer. `Math.round` at the edges, never a
  float in the middle.

## Surfaces

**The visit screen** (`/staff/appointments/[id]`) grows one ticket panel: the
service lines, each surcharge with who added it and when, the tier and reward
discounts already snapshotted on the visit, the total due, every payment taken,
and the balance. Under it, two forms — add a surcharge, record a payment.

**The station job aid** (`/staff/stations/[id]`) grows the groomer's half only:
add a surcharge from the published list, and the two things that go with it —
log what was found, and ask the owner. All three exist today and all three are
a walk to the counter terminal away from the person holding the clipper. The
consent request and the finding are not new code, just the existing actions
reachable from where the work happens; that is the gap the cluster 2 and 3
audit turned up.

**The counter** (`/staff/takings`) is the end of the day: today's payments by
method, the tip total, and — the operational half — every finished visit with
an unsettled balance, oldest first. A pet that went home without paying is the
thing this screen exists to surface.

All three are behind the flag, each page redirecting itself, and every action
calls `requireStaff()`. Recording money is counter work, not a manager's.

## Analytics

`/staff/analytics` keeps reporting list-price revenue, and gains **taken**
beside it — the two are different numbers and the screen already labels the
first an estimate. Tips appear per groomer next to the commission estimate,
never inside it: commission is on list price by decision above, and a tip is
not the shop's money to pay out.

## Out of scope

- Refunds. A refund is a `Payment` with a negative amount when the shop asks
  for one; until then, a wrong row is deleted by the person who typed it.
- Deposits, per the operations spec.
- Anything Clover-initiated. Semi-integration needs merchant credentials and an
  app in Clover's market; the `reference` column is the whole seam.
- Tax, a product catalog, and the treats business.

## Testing

`lib/ticket.test.ts` only: the null price, the discount floor, the tip not
settling a balance, the overpayment, and a split payment summing. The screens
and the actions get no tests, the same line the previous clusters drew.
