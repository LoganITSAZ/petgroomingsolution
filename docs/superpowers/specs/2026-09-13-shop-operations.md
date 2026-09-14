# Running the Whole Operation — Spec

Decisions agreed with the shop owner on 2026-09-13. This is the source every
plan in `docs/superpowers/plans/` argues from. Where a plan and this document
disagree, this document is right and the plan is stale.

The app today quotes prices, tracks a visit across the floor, and sends two
emails. It does not record money, does not validate a booking, and cannot be
cancelled by the customer who made it. Nine gaps were identified; all nine are
in scope, sequenced across seven plans.

---

## Decisions

### Money is recorded, not taken

The shop takes payment on a **Clover terminal that this app will not integrate
with**. Staff read the amount off the app, key it into the terminal, the
customer taps or swipes, and staff record the result here.

- No processor, no card data, no PCI surface, no webhook. `Payment` rows are a
  record of something that happened elsewhere.
- `Payment.reference` is free text for Clover's transaction id, so a dispute
  can be traced later. It is the only hook a future integration would need.
- Clover *does* have a REST API, but terminal-initiated payments require
  semi-integration (Cloud Pay Display), merchant credentials, and an app
  registered in Clover's App Market. Do not design around it.

### No sales tax

The shop charges no sales tax on grooming. It sells dehydrated chicken treats,
but **that is a separate business** and never appears on this app's ticket.

There is no `taxCents` column and no product catalog. Adding tax later is a
migration plus a rate field, not a redesign.

**Ticket = services + surcharges − tier discount − reward discount + tip.**

### Deposits are out of scope

Wanted eventually, impossible without integration: a deposit's job is taking
money from someone who is not at the terminal. Record-only, it degrades to "we
wrote down that they promised", which holds no slot.

No-show risk is addressed instead by reminders (Plan 4) and the booking gate
(Plan 3). The `Payment` shape must not make deposits harder to add later.

### Surcharges are added mid-groom, by the groomer

`Surcharge` is already a published range (`minCents`/`maxCents`) — a matted
coat is $10–$30 depending on what is found on the table.

- Added from the **station job aid** (`/staff/stations/[id]`) as well as the
  visit screen, because matting is discovered an hour before anyone thinks
  about the total.
- Severity increments of **$10**. Light matting $10, extreme $50 or more.
- The published range is **advisory, not binding**. A genuinely awful coat can
  be charged above `maxCents`; the server stores what was actually charged and
  flags the override rather than refusing it.
- Every line records **who added it and when**. The counter has to explain the
  number to an owner who was quoted something smaller.

### Booking validation refuses only what is definitely wrong

A groomer grooms one pet at a time, but pets sit in kennels between bath and
groom — so **a groomer's bookings are expected to overlap in wall time**.
Per-groomer exclusivity would refuse the shop's normal way of working. The
one-at-a-time rule is already enforced where it belongs: `stationCapacity()`
returns 1, at runtime, on the floor.

Refuse:

1. A time in the past.
2. A day the shop is closed (`SystemConfig.businessHours`).
3. A time outside that day's open/close.
4. Inside `bookingLeadHours` or beyond `bookingWindowDays` (customer paths only
   — staff book a customer standing at the counter for ten minutes' time).
5. A day with no kennel space left, when the visit needs one
   (`kennelDemand()`, already computed and already consulted by the staff form).

**Not** refused: overlapping bookings per groomer. No cap until someone
actually over-books one — a number with no evidence behind it is a number that
refuses legitimate work.

### Cancellation is never blocked

- Customers self-serve cancel and reschedule **right up to the start time**.
- `portalCancelNoticeMins` (default 60) is the shop's stated courtesy window.
  Inside it the portal still cancels, but also asks them to call, and the
  cancellation is flagged short-notice so it reaches `serviceAlerts()` — there
  is a person on the floor expecting that dog.
- Blocking late cancellation converts a cancellation into a no-show, which is
  strictly worse for the shop.
- **Reschedule moves the existing visit.** Same appointment id, same history,
  same tier snapshot. Cancel-and-rebook would pollute the rebooking-cadence
  insight with a cancellation that never happened.

### Three strikes removes online booking

- A **strike** is a `NO_SHOW`, or a `CANCELLED` whose status-history row is
  timestamped **at or after `scheduledAt`**. Cancelling before the start, even
  by five minutes, is polite and never counts.
- Derived from `AppointmentStatusHistory`, never a stored counter — same rule
  as rewards, for the same reason: a counter drifts the first time a status is
  corrected.
- Strikes **roll off after 3 months** (`bookingStrikeWindowMonths`, default 3).
- `bookingStrikeLimit`, default 3.
- Staff can **clear** strikes from the customer's profile
  (`Customer.bookingBlockClearedAt`); strikes before that stamp stop counting.
  Someone's three misses will turn out to be a hospital stay.
- A blocked customer is **told, with the shop's phone number**. A button that
  quietly vanishes turns a blocked customer into a lost one.

### Reminders run on an in-process timer

- One module, woken hourly inside the Next server. No new container, no new
  dependency, no scheduler.
- Safe **only** because single-instance is already a hard constraint here — the
  SSE subscriber map in `lib/station-events.ts` has the same requirement, so
  nothing is given up. If the app is ever scaled out, this and SSE break
  together and need the same pub/sub answer.
- Sends are marked by a **row**, not a timer, so a restart mid-window resends
  nothing and a missed hour is picked up late rather than dropped.
- **One reminder, the afternoon before**, covering tomorrow's booked visits.
  Not walk-ins, not already-cancelled.
- Channel: **SMS with email fallback** — text if there is a usable number and
  they have not opted out, otherwise email. Degrades correctly while Twilio is
  unconfigured, which is the shop's state today.

### SMS sends on two events, and consent is a column

`lib/sms.ts` is Twilio-backed and non-throwing, gated on `featureSmsNotify` plus
complete credentials. It sends on **ready-for-pickup**
(`changeAppointmentStatus()`) and **booking confirmation**
(`sendBookingNotifications()`). Email and SMS are gated separately — neither
early-returns on the other's flag.

Consent is `Customer.smsOptOut`, editable by the customer on their portal
profile and by staff on the customer's profile, and every body carries the STOP
line. Each send site checks `phone && !smsOptOut` before calling; a shared
`notifyCustomer()` is worth extracting once a third event needs it.

**Two creation paths still notify nobody** — `POST /api/appointments` and
`/api/walk-in` call neither channel. Plan 1's shared `createAppointment()` is
where that is fixed, not in the send layer.

### Vaccinations warn, never block

- One `vaccinationValidMonths` setting, default 12. Stale is null or older.
- Confirmation only ever happens at a visit, so "not seen in over a year" and
  "confirmed more than a year ago" are **the same condition** — one check, not
  two. A customer returning after 14 months trips it automatically.
- **Warn at check-in and in `serviceAlerts()`.** Never block: a hard stop fires
  on a regular whose paperwork is in the van, and staff learn to click through.
- No per-vaccine rows. The shop records one eyeballed date; a half-filled
  vaccination table reads as authoritative while being wrong.
- The gap is not the data model — it is that the date sits on a profile page
  nobody opens during a check-in.

---

## Plan sequence

Each plan ships working, testable software on its own, and is ordered so no
plan depends on one after it.

| # | Plan | Gap items closed |
|---|---|---|
| 1 | Booking core | validation, business hours, walk-in assignment |
| 2 | Money | payments, surcharges on the ticket, reconciliation |
| 3 | Portal self-service | cancel/reschedule, three-strike gate |
| 4 | Notifications | reminders, cancellation and no-show notices, SMS consent |
| 5 | Vaccination warnings | vaccination proof is inert |
| 6 | Timesheet | presence events are not a timesheet |
| 7 | Rebooking | nothing acts on rebooking cadence |

Plan 1 is first because three of the nine items share one root cause: **four
independent appointment-creation paths**, none of which validate the same way.

- `app/api/appointments/route.ts` POST
- `app/portal/appointments/new/page.tsx` — `createPortalAppointment` server action
- `app/api/walk-in/route.ts`
- `app/staff/appointments/new/page.tsx`

Only the staff page calls `defaultAssignment()`. Only the staff form checks
kennel demand. Guarding each caller separately is four diffs and four future
regressions; one shared `createAppointment()` is one.

---

## Global constraints

Copied from `CLAUDE.md`; every plan inherits these.

- **Money is cents.** Format through `lib/pricing.ts`. Never floats.
- **Wall-clock comparisons go through `SHOP_TIMEZONE`** (`America/Phoenix`).
  Never `getHours()`, never `setHours(0,0,0,0)`, never bare
  `toLocaleTimeString()`. "Today" is `shopDayRange()`. Server components render
  dates through `formatShopDate` / `formatShopTime`.
- **Status changes go through `changeAppointmentStatus()`**
  (`lib/appointment-status.ts`). Never write `status` directly.
- **Server actions re-authorise themselves** — they are their own endpoints and
  middleware does not run for them. `requireStaff()` / `requireManager()` /
  `requireAdmin()` from `lib/auth-guards.ts`.
- **Notification sends are non-fatal.** `.catch(console.error)`, always.
- **New editable `SystemConfig` columns go in `PATCHABLE_FIELDS`** in
  `app/api/admin/settings/route.ts` or the UI silently drops them.
- **No API client at module scope from an env var** — Next evaluates route
  modules during `next build`. Follow the lazy shape in `lib/email.ts`.
- **Route handlers use the Next 14 signature** `{ params }: { params: { id: string } }`.
- **Prisma models are `PascalCase` with explicit `@@map`** to snake_case.
- Prefer **zod** for new route validation.
- Run `npm run db:generate` after **any** `schema.prisma` edit.
- `next lint` covers test files — an unused import there fails `next build`.
- Tests are Vitest, colocated `lib/*.test.ts`. `npm test` and
  `npx tsc --noEmit` are both clean; keep them that way.
- **One page is one card** — `PageShell` primitives from `components/ui/`.
  One `PageShell` per page, one `grow` band.
- **Never `text-white` on `bg-brand-*`** — use `text-brand-on-600` /
  `text-brand-on-700`.
- **Darkening a background means darkening its text and borders in the same
  edit**, in the `.dark` block in `app/globals.css`.
