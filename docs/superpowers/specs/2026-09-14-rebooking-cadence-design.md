# Rebooking cadence: the customers who have not come back

**Date:** 2026-09-14
**Status:** approved design, not yet implemented

## Why

`lib/insights.ts` has known which customers are overdue since it was written.
`customerRhythm()` measures a household's usual gap between grooms and flags
`dueForRebooking` / `lapsing` — and it shows that on one customer's page, one
customer at a time. Nobody at the counter opens 120 profiles to find out who
has drifted.

Two things are missing, and they are the same arithmetic pointed at the whole
book rather than one row:

1. A list the shop can work: who is overdue, by how long, with a number to call
   and a booking link.
2. A message that goes out without anybody remembering to send it — the fourth
   job named in the scheduled-jobs spec.

## Decisions taken

| Question | Decision |
|---|---|
| New cadence maths? | No. The same median-gap rule as `customerRhythm()`, moved into a pure module and pointed at every customer at once. |
| How is "prompted once" guaranteed? | A `NotificationLog` row anchored on the customer's **last finished visit**. |
| A cooldown setting? | No — see below. It falls out of the anchor. |
| How many new settings? | One: days of grace past the usual cadence. |
| Does the call list need the feature on? | Yes. The flag is the cluster, and a shop that does not chase customers should not read a screen about it. |
| Sending hours? | 09:00–17:00 shop time. A rebooking nudge is not worth waking anybody. |

## The anchor, and why there is no cooldown

`NotificationLog` is `@@unique([appointmentId, kind])` and `appointmentId` is
required. The scheduled-jobs spec said a kind that is not about one visit needs
its own uniqueness decision rather than an inherited one. This is that kind, and
the decision is: **anchor the prompt to the visit it is chasing** — the
customer's most recent finished appointment.

That makes the constraint say exactly the right thing: *one prompt per completed
visit*. A customer who is nudged and books gets a new last visit, so the next
lapse is a new anchor and a new prompt. A customer who is nudged and ignores it
is never nudged about that visit again. No cooldown column, no "last prompted"
date to keep correct, and nothing to reset.

## Data model

```prisma
enum NotificationKind {
  APPOINTMENT_REMINDER
  REBOOKING_PROMPT
}
```

No new tables. One new setting pair on `SystemConfig`:

```prisma
featureRebookingPrompts Boolean @default(true)
rebookingGraceDays      Int     @default(7)
```

Grace is days *past* the household's own cadence before the shop says anything —
a customer who books every eight weeks is not overdue on day 57. It is the only
number, because everything else is measured from the customer's own history
rather than a shop-wide guess.

## `lib/rebooking.ts`

Pure decisions at the top, queries at the bottom, the shape `lib/kennels.ts`
and `lib/vaccinations.ts` already use.

```ts
export interface RebookingHistory {
  customerId: string;
  /** Finished visits, oldest first. */
  visits: { id: string; at: Date }[];
  hasUpcoming: boolean;
  prompted: boolean;
}

export interface RebookingDue {
  customerId: string;
  cadenceDays: number;
  lastVisitId: string;
  lastVisitAt: Date;
  daysSince: number;
  /** How far past their own cadence, in days. */
  daysOverdue: number;
  lapsing: boolean;
  prompted: boolean;
}

export function rebookingDue(
  history: RebookingHistory[],
  options: { graceDays: number },
  now: Date
): RebookingDue[];
```

Rules, all of them inherited from `customerRhythm()` so the two screens cannot
disagree:

- Fewer than `MIN_VISITS_FOR_PATTERN` (3) finished visits produces nothing. A
  cadence from two visits is noise, and this one sends mail.
- `cadenceDays` is the **median** gap, not the mean: one groom skipped over a
  holiday must not move a customer's normal.
- Due when `daysSince >= cadenceDays + graceDays` and nothing is booked.
- `lapsing` at twice the cadence — the same threshold the customer page uses,
  carried through so the list can sort the worst first.
- Day counting goes through `shopDayKey()`, like `lib/vaccinations.ts`: "eight
  weeks since" is a date question, not an instant question.

The query half is one `findMany` over appointments — finished and scheduled
together, grouped per customer in memory. A call list is a page the counter
opens, not a per-row lookup.

## The call list

`/staff/rebooking`, in the Storefront group behind
`feature: "featureRebookingPrompts"`, page redirecting itself like every other
gated screen. Worst first: lapsing, then days overdue.

Per row: the household, their pets, when they were last in, their usual
cadence, how far past it they are, the phone number as a `tel:` link, whether a
prompt has already gone out, and a link straight into the booking form for that
customer. Every row carries its numbers, the `evidence` rule from
`lib/insights.ts` — a list that says "overdue" without saying "books every 42
days, last seen 61 days ago" is a list nobody trusts twice.

No actions on the screen. Rebooking is a phone call, and the booking link is
where it ends.

## The job

`rebookingJob`, `everyMins: 60`.

1. Skip when the flag is off.
2. Skip outside 09:00–17:00 shop time, with the hour in the reason so the log
   reads plainly.
3. Take the due list, drop anyone already prompted, claim the
   `NotificationLog` row against the anchor visit, then send.
4. Channels and non-fatal sends exactly as the reminder job does them:
   `featureEmailNotify` plus an address, `featureSmsNotify` plus a parsing
   number and no `smsOptOut`.

Copy sits beside its siblings: `sendRebookingPrompt()` in `lib/email.ts`,
`smsRebookingPrompt()` in `lib/sms.ts`. It says how long it has been and how to
book, and it never claims to know the pet is due for anything medical.

A customer with no channel at all still appears on the call list — the shop
rings them. The job logs `channels: []` for them rather than skipping, because
the anchor is "we have chased this visit", and the shop chasing it by phone is
the same fact.

## Testing

`lib/rebooking.test.ts`, pure halves only:

- Two visits produce nothing; three produce a cadence.
- The median, against a mean that would differ.
- The grace boundary, both sides.
- Something booked suppresses a due customer.
- `lapsing` at twice the cadence.
- An already-prompted customer stays on the list but is not sent to.

The job wiring, the screen and the settings field get no tests, the same line
the scheduled-jobs work drew.

## Out of scope

- A "snooze this customer" control. The anchor already means one prompt per
  visit; a second suppression mechanism needs a reason first.
- Choosing a channel per customer. The shop's two switches decide, as everywhere
  else.
- Anything about what the prompt costs or earns. That is the money cluster.
