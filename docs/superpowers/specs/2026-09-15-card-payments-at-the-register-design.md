# Card payments at the register

**Date:** 2026-09-15
**Status:** approved design, not yet implemented

## Why

`docs/superpowers/specs/2026-09-14-money-at-the-counter-design.md` decided the
app does not take payment: the shop's terminal does, and `Payment` rows record
something that happened elsewhere. That decision bought a clean PCI posture at
the cost of typing every total twice — once into the terminal, once into the
app — and of the two never quite agreeing.

This design reverses only the first half. The app tells a card reader what to
charge and for which visit; the reader takes the money; the `Payment` row is
written from the result. Card data still never touches the app.

The alternative considered and rejected was pulling the day's transactions back
from the processor and matching them to visits. Matching is unavoidable in that
direction — a transaction knows an amount and a time, never a pet — and it
makes the shop do reconciliation work by hand every evening. Pushing the charge
means the payment is born attached to a visit and there is nothing to match.

## Decisions taken

| Question | Decision |
|---|---|
| Push or pull? | Push. The app initiates the charge, so the transaction carries the visit. |
| Which processor? | Both declared, Stripe implemented. Clover needs a published Clover app, a Remote App ID and merchant OAuth before a shop can use it at all — it is a registry entry that reports what it needs, not a dead switch. |
| Where does a reader live in the model? | On a `Station` with `role = REGISTER`. The shop already manages its floor as stations; a register is one more unit. |
| Webhook or poll? | Poll, plus a sweep job. Stripe documents that a reader disconnecting mid-payment sends **no** webhook at all, so a poll is needed either way — and once it exists the webhook earns nothing but a public endpoint, a signing secret and replay handling. |
| Where does the secret key live? | An environment variable. Stripe's guidance is explicit that a secret key must not sit in source or in application storage. This deviates from the Twilio precedent on `SystemConfig`, deliberately: that token sends texts, this key moves money. |
| Tips | Prompted on the reader. The confirmed PaymentIntent's `amount` already includes the tip and `amount_details.tip.amount` carries it separately, which is exactly the existing `Payment` shape. No schema change. |
| Cash and check | Unchanged. Hand-entered, no reader involved. |
| Refunds | Out of scope. |
| Capture | Automatic. The shop has no reason to hold an authorization, and a manual capture expires in two days. |

## The attempt row is the whole safety argument

A charge that succeeds while the app has no record of it is the failure that
matters. Everything below is arranged so that cannot happen.

```prisma
enum PaymentProvider { STRIPE CLOVER }

enum PaymentAttemptStatus { PENDING SUCCEEDED FAILED CANCELED }

model PaymentAttempt {
  id             String   @id @default(cuid())
  appointmentId  String
  /// The register it was sent to. Kept even if the station is later deleted.
  stationId      String?
  provider       PaymentProvider
  /// The provider's id for the charge -- a Stripe PaymentIntent. Unique, so a
  /// retry can never produce a second attempt against one intent.
  providerRef    String   @unique
  /// Generated before the first call and reused on every retry of this
  /// attempt. Stripe replays the first response for 24 hours, so a timeout
  /// during "create intent" cannot charge a customer twice.
  idempotencyKey String   @unique
  /// What was asked for, before any tip the reader collects.
  amountCents    Int
  status         PaymentAttemptStatus @default(PENDING)
  /// Set from the provider. `failureCode` is for staff; only a card_error is
  /// safe to read out to the customer.
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

`Payment` gains `provider PaymentProvider?` — null for the cash and checks the
counter still types in — plus the back-relations the block above requires:
`attempt PaymentAttempt?` on `Payment`, and `paymentAttempts` on `Appointment`,
`Station` and `Staff`.

The order is the point:

1. Write the attempt, `PENDING`, with its idempotency key. **Before** anything
   is sent anywhere.
2. Create the PaymentIntent (`card_present`, `capture_method: automatic`).
3. `process_payment_intent` on the register's reader, with
   `enable_customer_cancellation` and `tipping[amount_eligible]` set to the
   pre-tip balance, so a percentage tip is calculated on the groom rather than
   on a matting surcharge.
4. The open page polls. On a terminal outcome, `settleAttempt()` writes the
   `Payment`.
5. `paymentSweep`, a scheduled job, settles anything still `PENDING` after two
   minutes.

Steps 4 and 5 call the same function. `settleAttempt()` is the only code in the
app that turns a provider outcome into a `Payment` row, and it is idempotent on
`providerRef` and `paymentId`. The tab closing, the container restarting
mid-tap, and Stripe having a bad afternoon all land in step 5.

## `lib/payments/`

```ts
export interface ChargeRequest {
  readerRef: string;
  amountCents: number;
  tipEligibleCents: number;
  /// Shown on the reader: the pet and the shop.
  description: string;
  idempotencyKey: string;
}

export type ChargeOutcome =
  | { status: "PENDING" }
  | { status: "SUCCEEDED"; amountCents: number; tipCents: number; reference: string }
  | { status: "FAILED" | "CANCELED"; code: string; message: string; customerSafe: boolean };

export interface PaymentProviderAdapter {
  key: PaymentProvider;
  label: string;
  /// What is missing, or null when live. Same shape as `needs` in lib/features.ts:
  /// the settings screen says why rather than showing a switch that does nothing.
  needs(): string | null;
  startCharge(request: ChargeRequest): Promise<{ providerRef: string }>;
  pollCharge(providerRef: string): Promise<ChargeOutcome>;
  cancelCharge(readerRef: string, providerRef: string): Promise<void>;
  listReaders(): Promise<{ id: string; label: string; status: string; livemode: boolean }[]>;
}
```

- `stripe.ts` implements it against the `stripe` package — a new dependency,
  taken for typed errors and idempotency handling on a money path rather than
  for the forty lines of `fetch` it replaces. Constructed **lazily**, never at
  module scope: `next build` evaluates route modules and the key is absent in
  CI (the rule `lib/email.ts` already follows). `apiVersion` is pinned in the
  constructor, because stripe-node otherwise floats to whatever was current
  when the package was published.
- `clover.ts` implements `needs()` and nothing else. Its methods throw; they
  are unreachable while `needs()` is non-null.
- `index.ts` holds the registry and `activeProvider()`.
- `settle.ts` holds `settleAttempt()` and the pure
  `paymentFromOutcome()` — `amountCents` from `amount`, `tipCents` from
  `amount_details.tip.amount ?? 0`, `reference` from the card brand and last
  four.

`SystemConfig.paymentProvider` selects the provider. The key does not go beside
it: `STRIPE_SECRET_KEY` is read from the environment, and the shop is told to
use a **restricted** key (`rk_live_`) scoped to PaymentIntents write and
Terminal write.

## Other processors

The question this design will be asked in six months is "can we use X". One
property decides it: whether a **server** can push a charge to the reader over
the internet. That line does not follow brand names — Square sells hardware on
both sides of it.

| Processor | Fits | Why |
|---|---|---|
| Stripe Terminal | yes | Implemented here. |
| Square Terminal | yes | Server creates a checkout, Square forwards it to the paired device, the result is polled or pushed. Tip screens are configured per request rather than per account. |
| Clover | yes, gated | REST Pay Display, behind a published Clover app and merchant OAuth. |
| Adyen | yes | Cloud Terminal API is the same shape; the cost is onboarding, not code. |
| Zettle, SumUp, Square Reader and Stand, Stripe's Bluetooth readers | **no** | Bluetooth to a phone, driven by a mobile SDK. No server call wakes them. Supporting one means shipping a native app. |
| Fiserv, Worldpay, Dejavoo, standalone PAX | **no** | Semi-integrate over the shop's LAN with proprietary protocols. Needs a bridge on the shop network, not a cloud adapter. |

Nothing about a register is Stripe-shaped: `readerRef` is an opaque device id,
and Stripe's `tmr_…`, Square's `device_id` and Clover's device id are all just
strings.

Checking Square against the interface changed two things. Its tipping is
per-request where Stripe's is an account-level Configuration object, which is
why `ChargeRequest` carries `tipEligibleCents` and leaves *how to prompt* to
the adapter — the seam survived contact with a second real API rather than
being Stripe's API with a coat on. And Square warns of significant delay
between requesting a checkout and completing it, so a 90-second page poll will
time out there more often than on Stripe. The sweep job is therefore
load-bearing for the second provider, not insurance for the first.

## A register is a station, and not a work station

`StationRole` gains `REGISTER`; `Station.readerRef` holds the paired reader and
`Station.readerLivemode` what mode it was paired in. `nextStationName()` gives
it `Register 1`; `formatStationRole()` renders it; the station form offers a
reader picker instead of the kennel grid.

The hazard is existing code that means "a place a pet stands" and spells it
`role !== KENNEL` — [app/staff/page.tsx](app/staff/page.tsx) does, and so do
the default-station dropdowns in [app/admin/staff](app/admin/staff). Adding a
role to the enum would quietly offer registers as grooming stations.

Fix it once rather than per caller: `WORK_STATION_ROLES` in
[lib/stations.ts](lib/stations.ts), and every such filter reads it.
`stationCapacity()` returns 0 for a register — no pet ever stands at one.

**Reader ids are mode-scoped.** A reader registered under a test key is
invisible to a live one. Pairing records `readerLivemode`; the charge path
refuses a mismatch with a sentence a person can act on, rather than surfacing
`resource_missing` to somebody at a counter with a customer waiting.

## Surfaces

- **Visit screen** — "Take payment" when the feature is on, a provider is live,
  and the balance is positive. Picks a register when there is more than one.
  The amount is re-read from the ticket server-side; a posted total is never
  trusted. While an attempt is open the button becomes a live status with a
  cancel that calls the provider's cancel.
- **`/staff/payments`** — a band naming the provider and its registers, and
  today's failed or stuck attempts. A jammed reader should be visible on the
  screen that reports the day's money, not silent.
- **`/admin/payments`** — ADMIN only, the tier `/admin/notifications` sits at.
  Reports whether the key is present and which mode it is in, lists the readers
  it can see, and links to the register stations. No key input: there is
  nothing to type because the key is an environment variable, and the screen
  says so.
- **`/admin/stations/[id]/edit`** — the reader picker for a register, the same
  way kennel capacity lives on the station that has it.
- **DEPLOY.md** — `STRIPE_SECRET_KEY`, the restricted-key scopes, and the
  one-time Dashboard steps: create a Location, register the reader to it, set
  the tipping Configuration.

Tip suggestions are not configured in this app. They live on a Stripe
`Configuration` object set from the Dashboard, and a second place to type them
would be a second place for them to be wrong.

## Errors

Split two ways, because they have different readers. `api_error.type ===
"card_error"` — declined, insufficient funds — is shown at the counter and can
be read out to the customer; the same PaymentIntent is reused for the retry,
per Stripe's double-charge guidance. Everything else (`invalid_request_error`,
a reader offline, a busy reader, our own bugs) is staff-facing, logged, and
recorded on the attempt.

The attempt rows are the local log Stripe's go-live checklist asks for: if the
key or the network is what broke, the provider's own logs will not have the
request either. The key is never logged. Nothing else sensitive can be — the
app never sees more than a brand and four digits.

## Out of scope

Refunds and voids. Partial captures. A register kiosk screen at
`/station/[id]`. Webhooks. Clover. Storing a card on file. Sales tax, which
grooming does not charge and which the earlier design already settled.

## Testing

Pure, offline, fed fixture provider objects — the rule from
[lib/ticket.ts](lib/ticket.ts), that money in a page component is money nobody
can test:

- `paymentFromOutcome()` — the tip split, the no-tip case
  (`amount_details.tip.amount` of `0` and of `null`), the reference.
- The attempt state machine: which transitions settle, which are terminal, and
  that settling twice writes one `Payment`.
- `needs()` for each provider, and `activeProvider()` when none is configured.
- `WORK_STATION_ROLES` excludes `REGISTER`, so the regression this design could
  cause is caught by a test rather than by a groomer.

Hardware is verified by hand, not in Vitest: a sandbox key, a simulated reader
(`registration_code: simulated-wpe`) and `present_payment_method` give a full
rehearsal — success, decline, customer cancellation, tip and no tip, and a
sweep recovery with the tab closed mid-payment — with no reader on the desk.
