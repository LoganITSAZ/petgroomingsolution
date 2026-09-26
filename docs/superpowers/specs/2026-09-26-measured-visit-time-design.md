# Measured visit time

Sub-project 1 of the "insights" roadmap. Money per minute (2), groomer–pet fit
(3) and no-show risk (5) all read how long a visit actually took, so this
comes before them.

## Problem

The app measures a visit as check-in to finish (`lib/visit-duration.ts`), so an
hour waiting in a kennel reads as an hour of grooming — CLAUDE.md already
admits "an afternoon spent waiting for an owner reads as a four-hour groom".
Nothing shows where a visit's time went.

Separately, finishing a groom tells nobody. The board's "Waiting Pickup"
column, the kiosk and `/staff/me` all stop at `COMPLETE`; the email, text and
call go out only on `READY_PICKUP`, a second step somebody has to remember.

## What the shop told us

- Stage changes are tapped **live**, as each thing happens.
- Drying is **sometimes** hands-on and sometimes a cage dryer, depending on the
  dog. So it is its own figure, never classified per visit.
- Once a dog is done and in a kennel, the owner should be told **as part of the
  workflow**.
- Several dogs from one household on the same day: tell the owner when the
  **last** of them is done.

## Design

### The arithmetic — `lib/visit-time.ts`

Pure, no database. The history rows are the only input; nothing is stored.

**Segments.** Each `AppointmentStatusHistory` row opens a segment that ends at
the next row (or at `now`, passed in, for a visit still open). Buckets:

| Status         | Bucket                   |
|----------------|--------------------------|
| `CHECKED_IN`   | waiting                  |
| `IN_PROGRESS`  | bath (hands-on)          |
| `DRYING`       | drying                   |
| `FINISHING`    | table (hands-on)         |
| `COMPLETE`     | waiting for the household|
| `READY_PICKUP` | owner to collect         |

`SCHEDULED`, `CANCELLED`, `NO_SHOW` and `PICKED_UP` open nothing. A dog moved
backwards adds a second segment to the same bucket.

**Not a measurement.**

- A segment under 1 minute is a stage clicked through. It counts as
  unmeasured, not zero.
- A segment crossing into the next shop day (`shopDayKey()`) is a forgotten tap
  and is unmeasured.
- A bath, drying or table segment over 180 minutes is unmeasured. Waiting and
  owner-to-collect are cut only at the day boundary, since they can
  legitimately run all afternoon.

Each visit's result says which buckets were measured, so a screen shows a gap
rather than a false zero. Hands-on = bath + table; it is measured when at least
one of the two is.

**Summaries.** Medians, never means. Nothing below `MIN_VISITS_FOR_PATTERN`
visits. Every figure carries an evidence string ("median of 34 visits").

**`householdReadyToTell(visits)`** — given one customer's visits for one shop
day, returns the ids of the `COMPLETE` visits to move to `READY_PICKUP`: all of
them when none of the household's visits is still in the building and
unfinished (`CHECKED_IN`, `IN_PROGRESS`, `DRYING`, `FINISHING`), otherwise none.
Visits not yet arrived (`SCHEDULED`), cancelled or no-show hold nobody back.

**`petNames(names)`** — "Max", "Max and Bella", "Max, Bella and Rex", with the
matching "is" / "are".

### The workflow — finishing tells the owner, once per household

In `changeAppointmentStatus()` (`lib/appointment-status.ts`), the one path every
status change takes. After any change, it loads that customer's visits in the
same shop day (`shopDayRange()`) and runs `householdReadyToTell()`. Every visit
it returns moves to `READY_PICKUP` — with its own history row — and the owner
gets **one** email, one text and one call naming every dog in that batch.
Findings are listed per dog, prefixed with the dog's name.

- Running after *every* change is what lets a sibling cancelled or marked
  no-show release the dogs waiting on it.
- Notifications fire only for visits that moved in this change, so a re-save
  never sends twice.
- The existing manual "ready for pickup" action stays, so the counter can tell
  an owner early by hand.
- A dog moved back from `COMPLETE` after the household was told leaves its
  siblings at `READY_PICKUP`: the owner has been told and nothing unsends it.
  When that dog finishes again it moves on its own and the owner hears about
  it alone — it did move, so it is told.
- The board chip for a `COMPLETE` dog held back reads "Waiting for Bella".

The email subject, text and call currently say "`${petName}` is ready". They
take the joined names and the verb from `petNames()`. No other wording
changes.

### Where it shows

A queried half, `lib/visit-time-queries.ts`, loads history for many visits in
one query and hands it to the pure functions.

1. **Learned booking length.** `petOverruns()` compares **hands-on + drying**
   against the booked slot when the visit's hands-on was measured, falling back
   to check-in → finish otherwise. The median and the `[base/2, base*2]` clamp
   are unchanged.
2. **Analytics.** A "Visit Time" band on `/staff/analytics`: median waiting,
   bath, drying, table, waiting for the household, and owner to collect, each
   with its visit count.
3. **Visit screen.** One line under the status rail with that visit's figures,
   "—" for anything unmeasured, "so far" while the visit is open.
4. **Pickup lateness.** The existing thresholds keep measuring from
   `READY_PICKUP`, which is now when the owner was actually told. No new
   settings.

## Testing

Pure, in `lib/visit-time.test.ts`:

- Segments: a backward move, a clicked-through stage, a forgotten overnight
  tap, an over-long table segment, an open visit with `now`, a cancelled visit.
- Medians: below the minimum count; one extreme visit does not move it.
- `householdReadyToTell`: a lone dog; two dogs with one still on the table; the
  last one finishing; a sibling cancelled; a sibling not yet arrived.
- `petNames`: one, two, three names; "is" / "are".
- `overrunsFrom` in `lib/visit-duration.test.ts`: uses hands-on + drying when
  measured, falls back when not.

## Out of scope

- Per-groomer figures — sub-project 3 reads these same segments.
- `lib/pickups.ts` reading `updatedAt` as the moment a dog became ready. It
  predates this and is closer to true now, but any later edit to a waiting
  visit still resets it.
- Any migration: nothing new is stored.
