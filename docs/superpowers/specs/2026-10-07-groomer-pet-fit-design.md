# Groomer–pet fit

Sub-project 3 of the "insights" roadmap. It reads the hands-on time that
sub-project 1 measures (`workedMins()` in `lib/visit-time.ts`), the visit
events the shop already logs (`VisitEvent`), and the status history every visit
writes. It changes sub-project 2's money per minute only to fold a redo's
minutes into the visit it redoes.

## Problem

The booking groomer is whoever the owner once named
(`Customer.preferredStaffId`, read by `preferredGroomer()` in
`lib/stations.ts`), and the floor recommendations score that same column as
"their usual groomer". Nothing looks at who actually grooms the pet, how long
it takes them, or how often it goes wrong. A groomer who is slow on Doodles, or
whose Doodles keep coming back, keeps being handed Doodles, and the shop has no
screen that says which breeds each groomer is good at.

There is also nowhere to record that it went wrong. A complaint is a phone
call nobody writes down, and a redo is either a fix at the counter or a second
appointment that looks like an ordinary, cheap visit.

## What the shop told us

- **All three**: recommend the better groomer per pet (booking, floor, pet
  profile), show groomer strengths on Analytics, and derive the usual groomer
  from who actually grooms the pet.
- **The preferred groomer is only a preference.** It guarantees nothing; the
  fit may name somebody else.
- **Fit is speed and accuracy** — few errors.
- **Complaints and redos must count**, and a redo is recorded two ways: a
  linked appointment when it takes a slot, an incident when it is a fix at the
  counter.
- **Errors gate, speed ranks.** A groomer clearly worse on errors is never the
  pick, however fast. Among the rest the faster one wins. No invented exchange
  rate between minutes and mistakes.
- **The pet beats the breed**: the pet's own history when there is enough of
  it, else the breed and service.
- Thresholds and the order of the booking groomer as below, accepted as
  proposed.

## Design

### Data (one migration)

- `VisitEventType` gains `COMPLAINT` and `REDO`. Both are labelled in
  `formatVisitEvent()` (`lib/utils.ts`) and in the label and colour maps on
  `app/staff/pets/[id]/page.tsx`.
  - `COMPLAINT` requires a note — the server action refuses one without.
  - `REDO` is a fix done at the counter, logged on the visit it fixes.
- `Appointment.redoOfId String?`, a self-relation to the visit it redoes,
  `onDelete: SetNull`, indexed. It always points at the **root** visit: a redo
  of a redo copies its original's `redoOfId`, so the chain is one level deep.

### Recording

- **Complaint and counter redo** go through the existing event form on the
  visit screen (`logVisitEvent` in `app/staff/appointments/actions.ts`), which
  already takes any `VisitEventType`. The form stays available once the visit
  is finished — a complaint usually arrives days later.
- **Book a redo** — a button on a finished visit. It books the same pet,
  customer and services through `createAppointment()` with `redoOfId` set and
  no `staffId`, so the groomer is derived as for any booking and the gate below
  may pick somebody else.

### What is an error

An **error visit** is a finished visit (`FINISHED_STATUSES`) where any of:

- it has a `COMPLAINT`, `REDO`, `INJURY`, `BITE` or `BEHAVIORAL` event;
- another visit's `redoOfId` points at it;
- its status history moves **backward** against `STATUS_FLOW` order and it has
  no `REWASH` event — a logged rewash explains the move, and a rewash is not
  the groomer's doing.

`REWASH`, `MATTING_FOUND`, `EQUIPMENT_ISSUE`, `HEALTH_FINDING` and `OTHER` are
not errors. Errors are counted per **visit**, not per event: three complaints
about one groom are one error visit. Rate = error visits ÷ finished visits.

### Who it is charged to

- The visit's `staffId`, else whoever moved it to finished — the Analytics
  rule (`getCompletions()` in `lib/analytics.ts`).
- A **redo visit is never a sample** of its own. Its error is charged to the
  original's groomer, and its hands-on minutes are added to the original's for
  speed and for money per minute.

### The samples

Finished visits in the last **12 months** that are not redos. Each carries:
groomer, pet, breed guide (`guidesForBreeds()`, by guide id), primary
`serviceType`, size (`AppointmentService.sizeTier` of the primary line), coat
(`Pet.coatType`), error-visit flag with its causes, and hands-on minutes —
`workedMins(visitTime(history, now))` plus any redo's minutes, or null when
unmeasured. An unmeasured visit counts toward errors, never toward speed.

### The comparison

- **Level.** Decided once per comparison:
  - **Pet** — when at least two candidates each have **3** or more visits on
    this pet.
  - **Breed** — otherwise: same breed guide and primary service.
  - No breed guide and no pet level: no claim.
- **Error gate**, per candidate, needs all three:
  - at least **2** error visits;
  - rate at least **2×** the shop's;
  - rate at least **10 points** above the shop's.

  The shop's rate is always breed-level (every groomer's visits on that guide
  and service) — one pet's history is too thin to be a baseline. A shop rate of
  0% makes the relative test trivial; the two absolute ones still hold. A
  candidate under 3 visits at the level is never gated.
- **Speed.** Among candidates not gated with **3** or more measured visits at
  the level, the fastest median must beat the next fastest by both **15%** and
  **10 minutes**, or speed decides nothing.

### The booking groomer

`bookingGroomer()` returns `{ staffId, reason } | null`, first that holds:

1. **Fit winner** — "faster on this breed: 52 vs 71 min over 6 and 4 visits"
   (or "on this pet").
2. **Typed preference**, if active and not gated — "owner's preference".
3. **Derived usual groomer**, if active and not gated: most of the pet's last
   **5** finished visits, ties to the most recent — "groomed 4 of last 5".
4. `null`.

A preference or usual groomer passed over by the gate is named in the reason:
"Sam skipped: 2 of 5 visits had an error, shop 4%".

Candidates: at booking, active staff holding `GROOMER`; on the floor, the
ready people `assignmentSuggestions()` already considers.

### Code shape

- `lib/groomer-fit.ts` — pure, no database, takes plain sample rows:
  `isErrorVisit`, `errorGate`, `speedWinner`, `usualGroomer`,
  `bookingGroomer`, `fitInsights`, `strengthRows`, and the constants
  `FIT_WINDOW_DAYS = 365`, `MIN_FIT_VISITS = 3`, `MIN_ERROR_VISITS = 2`,
  `USUAL_GROOMER_VISITS = 5`.
- `lib/groomer-fit-queries.ts` — one load of the window's finished visits with
  history, events, redo children, primary line and pet; one
  `guidesForBreeds()` call for every breed; maps to the pure rows. Shared by
  booking, the floor, insights and Analytics.

### Where it shows

- **Booking.** `preferredGroomer()` becomes
  `preferredGroomer(customerId, petId, serviceType)` and calls
  `bookingGroomer()`. Its reason lands in the visit's status history note, as
  learned durations do. No new UI.
- **Floor recommendations** (`lib/recommendations.ts`). The "their usual
  groomer" score comes from `bookingGroomer()`'s pick and its reason replaces
  the fixed text. The rest of the scoring order is unchanged.
- **Shop insights** (`shopInsights()`, snoozable, dashboard and digest): one
  per gated groomer × breed guide × service — "Sam: 3 of 8 Doodle full grooms
  had an error, shop 5%". Evidence names each error's cause and date. At most
  **3**, worst rate first. Id `fit:<staffId>:<breedGuideId>:<serviceType>`, by
  guide id so a renamed guide keeps its snooze.
- **Pet insight** (pet and customer profiles, not snoozable): only when the
  pick differs from the typed preference — "Ana is the better fit for Bella:
  48 vs 66 min over 5 and 3 visits; owner prefers Sam".
- **Analytics** (`app/staff/analytics/page.tsx`, managers only): a **Groomer
  Strengths** section after Money per Hour. Three `<details>` — By Breed, By
  Size, By Coat — each a table of groomer × group: visits, error rate against
  the shop's, median minutes against the shop median. Only cells with 3 or
  more visits. A **Strength** flag where the groomer clears the speed test
  against the shop median and their error rate is not above the shop's; a
  **Watch** flag where they are gated. Absent when no cell qualifies — off is
  silence.
- **Money per minute** (`pricedVisits` in `lib/money-per-minute-queries.ts`):
  a redo's minutes are added to its original and the redo is dropped as a
  sample.

## Testing

`lib/groomer-fit.test.ts`, pure:

- Each error source counts; `REWASH`, `MATTING_FOUND`, `EQUIPMENT_ISSUE` do
  not; a backward move with a `REWASH` event does not; three complaints on one
  visit are one error visit.
- A redo is charged to the original's groomer and its minutes are added to the
  original's; the redo is not a sample.
- The gate: 1 error never gates; 2 errors at 2× but under 10 points does not;
  at 10 points but under 2× does not; all three does. Shop rate 0%.
- Speed: 20% but 8 min faster does not win; 12 min but 10% does not; both
  does. An unmeasured visit counts toward errors, not speed.
- Level: pet when two candidates have 3 on the pet, breed otherwise, nothing
  without a guide.
- `bookingGroomer` order: fit, preference, usual, null; an inactive or gated
  preference is skipped and named; usual-groomer ties go to the most recent.
- `fitInsights`: at most 3, worst first, stable ids.

`lib/money-per-minute.test.ts`: a redo's minutes fold into its original.

## Out of scope

- An owner-facing complaint form, or complaints read from SMS replies.
- Any effect on commission or pay.
- Cats and dogs are not split; the breed guide already separates them.
- Re-ranking other floor criteria (station fit, idle time).
