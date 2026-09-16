# Roadmap

What the shop has asked for, measured against what is already in the repo.
Four buckets: **shipped**, **in flight** (on a branch, not merged), **next**
(fits the model, nothing blocking), and **needs a decision** (blocked on a
choice or on something this app deliberately does not have).

Nothing here is scheduled. The order inside a bucket is the order the work
gets cheaper in, not a promise.

## Shipped

| Ask | Where it lives |
|---|---|
| Behaviour & handling notes | `Pet.temperamentNotes`, `hasBiteHistory` and the health flags — on every staff screen, and the kiosk paints a full-width `⚠ BITE HISTORY` banner ([lib/utils.ts](lib/utils.ts), [app/globals.css](app/globals.css)) |
| Before & after visual galleries | `VisitPhoto` with `BEFORE`/`AFTER`/`ISSUE` kinds, ordered and gated by [lib/visit-photos.ts](lib/visit-photos.ts); `featureVisitPhotos` |
| Digital intake forms | Waiver text, versioning and `WaiverAcceptance` per customer — [lib/waiver.ts](lib/waiver.ts), `/admin/waiver`, `featureWaiverRequired` |
| Grid view of stations | `/staff/appointments` draws the floor as five stages with the station on the chip ([components/FloorBoard.tsx](components/FloorBoard.tsx)) |
| Multi-groomer rotas | `StaffShift` rows, `/admin/schedule` to edit and `/staff/schedule` to read, with overtime and thin-day advice ([lib/schedule.ts](lib/schedule.ts)) |
| Automated rebooking triggers | `rebookingJob` on the scheduled runner, cadence per customer from their own history ([lib/rebooking.ts](lib/rebooking.ts)), `featureRebookingPrompts` |
| Commission payroll (the simple half) | `Staff.commissionPercent` over `SystemConfig.defaultCommissionPercent`, on the list price of services finished; `/staff/analytics` |
| Tips | `Payment.tipCents` — recorded off the Clover terminal, in the day's takings |

## In flight

On `feat/scheduled-jobs`, not merged.

- **Immunization & vaccine tracking.** `VaccineRequirement` / `PetVaccination`, requirements edited in Shop Settings, `featureVaccinationGate` to block a check-in on an expired certificate. Finish: the check-in refusal path and the "bring the certificate" message.
- **Breed- & weight-based time logic.** [lib/visit-duration.ts](lib/visit-duration.ts) suggests a duration from the pet's own measured visits (`MIN_VISITS_FOR_DURATION`), overriding the flat sum of service durations. It is per *pet*, not per breed — a pet with three visits beats any breed average. Breed/coat/weight is the fallback for a first visit and is not built.
- **Automated pickup and reminder messages.** `reminderJob`, `digestJob`, `slotOfferJob` on the runner; `NotificationLog` keeps what went out.

## Next

Fits the model as it stands.

1. **Add-on prompting at checkout.** The ticket screen already knows the booked lines and the catalog; the missing piece is "which services this pet usually gets and did not today". Reuse `rhythmsFor()` ([lib/rhythm.ts](lib/rhythm.ts)) rather than a new table, and put the prompt on the payments screen only — a suggestion on the booking form is a different feature.
2. **Automated voice alerts.** Twilio again, a `<Say>` TwiML call instead of a message body. `lib/sms.ts` is a single authenticated POST with no SDK; the call endpoint is the same shape. Gate it behind its own flag, not `featureSmsNotify` — a shop that texts has not agreed to ring people.
3. **E-signatures on the waiver.** The acceptance row exists; what is missing is the drawn signature and the second and third documents (matting release, emergency medical). Store the signature as a `Photo` row, same as everything else — one volume to back up.
4. **Variable commission.** Today it is one percentage per groomer. A real split needs rate *per service or per category* and an hourly floor, both on `Staff`. Keep it an estimate, never payroll.
5. **Calendar month/week grid.** `/admin/schedule` is a week of staff rows; a booked-appointments grid is a second view over data already queried.

## Needs a decision

Each of these is blocked on a choice rather than on effort. A recommendation
comes with each one so none of them sits here indefinitely — pick the
recommendation or overrule it, but the bucket is meant to empty.

### Two-way SMS

**The choice:** does the shop want a text inbox somebody watches?

Outbound is done. Inbound is deliberately absent — a reply needs a public
callback URL and Twilio signature verification, and the consent flow was built
around a phone call instead ([CLAUDE.md](CLAUDE.md)). The cost is not the
webhook; it is that an inbox nobody reads is worse than no inbox, because the
owner believes they have replied.

**Recommendation: no, not yet — build the narrow half instead.** One reply
that resolves one question: yes or no to a shave-down. `consentState()`
([lib/appointment-status.ts](lib/appointment-status.ts)) already models the
four columns and already expects the answer to arrive out of band. A webhook
that matches the sending number to the open consent request and writes
`consentGrantedAt` / `consentDeclinedAt` needs no threads, no inbox and no
staffing, and it is the one message the shop is already waiting on. Signature
verification is required on day one, not later — the endpoint is public and it
writes consent.

Revisit the general inbox when somebody is at a desk all day.

### No-show and deposit protection

**The choice:** card-on-file, or a fee the counter charges next time?

Card-on-file means a payment processor, a vault and PCI scope this app does
not carry. The shop takes money on its own Clover terminal; nothing here
stores a card and the app never moves a cent.

**Recommendation: the fee line, and stop there.** `Surcharge` /
`AppointmentSurcharge` already exist and already attach an extra fee to a
visit with a note explaining the number. A "Missed appointment" surcharge plus
a prompt on the booking form when the customer has a `NO_SHOW` in recent
history is most of the deterrent at none of the scope. It collects late — but
it collects from exactly the people who come back, which is everyone worth
collecting from.

Only reopen card-on-file if the shop measures a no-show rate the fee does not
move.

### Integrated online shop

**The choice:** is retail this app's job at all?

A second product catalog, stock counts, fulfilment and a checkout that
actually charges. It shares a login with the booking app and nothing else.

**Recommendation: no — sell it at the counter, link out for the rest.** The
service catalog already handles "things the shop sells with a price"; retail
stock is a different model with a different failure mode (overselling). If the
shop wants to sell shampoo online, a hosted store on its own subdomain costs a
weekend and no maintenance here. Revisit only if retail becomes a real revenue
line rather than an impulse buy at pickup.

### Reserve with Google

**The choice:** nothing to decide except order.

Needs a partner agreement, a public real-time availability feed and a booking
API Google calls. Every one of those sits on top of online booking.

**Recommendation: park until online booking has run a full season.** The
integration is not hard; being wrong about availability in public is. Requeue
when `featureOnlineBooking` has been on long enough that the shop trusts the
calendar it would be publishing.

### Mobile grooming — routes, "on my way", map view

**The choice:** is the shop going mobile?

This app models a fixed shop: stations, kennels, a floor board, a lobby kiosk.
There is no vehicle, no route, and a customer's address is a place on a map
rather than a destination. Mobile is a *mode*, not three features — a van
entity, a day as an ordered route instead of a set of station assignments, and
travel time inside the duration arithmetic that
[lib/visit-duration.ts](lib/visit-duration.ts) now owns.

**Recommendation: answer the business question first, build nothing until
then.** If the answer is yes, the order is van → route → "on my way" → map
view, and route optimization is last because a hand-ordered route beats no
route and an optimizer over an empty model is nothing. "On my way" is the only
one that is cheap on its own, and only once a route exists to know who is
next. Addresses already geocode through keyless OpenStreetMap
([lib/maps.ts](lib/maps.ts)), so the map view is a view, not a project.

## Sizing and order

No dates. There is no team size, no deadline and no velocity to divide by, and
a date invented here would be fiction the shop plans around. Sizes are
relative to each other: **S** is a sitting, **M** a few days, **L** a feature
with a migration and screens of its own.

Assumes one developer and nothing else running. Change the assumption and the
sizes hold; only the calendar moves.

| # | Item | Size | Why here |
|---|---|---|---|
| 1 | Finish the vaccination gate | S | Already on the branch; unmerged work is the most expensive kind |
| 2 | No-show fee line | S | Reuses `AppointmentSurcharge` whole; revenue on day one |
| 3 | Add-on prompting at checkout | S | `rhythmsFor()` already knows what the pet usually gets |
| 4 | Consent reply webhook | M | Narrow two-way SMS; signature verification is not optional |
| 5 | Automated voice alerts | M | Same Twilio POST shape as `lib/sms.ts`, own flag |
| 6 | E-signatures, second and third documents | M | `WaiverAcceptance` exists; signature is a `Photo` row |
| 7 | Calendar month/week grid | M | A second view over data already queried |
| 8 | Variable commission | L | Rate per service or category, plus an hourly floor, both on `Staff` |
| 9 | Breed fallback for first-visit duration | M | Only matters for a pet with fewer than `MIN_VISITS_FOR_DURATION` visits |
| 10 | Reserve with Google | L | Waiting on a season of online booking, not on effort |

Everything recommended against above is absent from this table on purpose.

## Tracking

There are no issue numbers because there are no issues — the repo's tracker is
empty. If the shop wants these as GitHub issues rather than a table, the ten
rows above map one to one.
