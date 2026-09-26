# Money per minute

Sub-project 2 of the "insights" roadmap. It reads the hands-on time that
sub-project 1 measures (`workedMins()` in `lib/visit-time.ts`) and the size
each line was quoted at, which sub-project 0 snapshots
(`AppointmentService.sizeTier`).

## Problem

The shop sets a price per service and size and never sees what that price
earns for the time it takes. A large Doodle full groom and a large Labrador
full groom are the same line on the price list and nowhere near the same
afternoon. Nothing in the app puts the ticket beside the hands-on minutes, so
an underpriced service is only noticed by the groomer who is always late
finishing it.

## What the shop told us

- Group by **service × size** — it is the price list, so every figure answers
  "which price is too low?" — **and** by **breed** inside that, for the dogs a
  size price does not cover.
- **Suggest a figure**, not only a gap. Shown, never applied.

## Design

### What is counted

- **Visits.** Finished (`FINISHED_STATUSES`) in the window, with a measured
  hands-on time — `workedMins(visitTime(history, now))` not null — and at least
  one `AppointmentService` line. Nothing else; no new column, no migration.
- **Money is the ticket before discounts**: service lines plus surcharges,
  i.e. `serviceCents + surchargeCents` from `ticketFromRow()` over
  `TICKET_SELECT` in `lib/ticket.ts`. The legacy rate and the reward punch are
  prices the shop agreed on purpose; counting them would make a service full
  of legacy customers look underpriced and the suggestion would raise the list
  price for everybody. Surcharges stay in: a breed fee already charged is what
  pays for that breed's time. Tips are not the shop's price and are left out.
  It is list prices, and every surface says so.
- **Rate is weighted**: total ticket ÷ total hands-on hours, never an average
  of per-visit rates, so a busy service weighs more.

### The groups

- **Shop rate** — every counted visit, add-ons included.
- **Service × size row** — visits with **exactly one** service line, keyed by
  the line's `serviceId` and `sizeTier`. A visit with add-ons counts toward the
  shop rate only: its time cannot be split between its lines, and splitting it
  by booked durations would be invented precision.
  - A **flat-priced** service (`isSizePriced()` false on the catalog row) is
    one row whatever `sizeTier` says.
  - A size-priced line with `sizeTier` null (quoted before sizes were derived,
    or an unknown size) is left out of the rows — its size is not known.
  - A line whose `serviceId` is null (service deleted) is left out of the rows.
- **Breed** — within one service × size row, pets grouped by the shop's breed
  guide when `guidesForBreeds()` matches (`guide.breed`), else by the typed
  breed trimmed and lower-cased. No breed, no group. Labelled with the guide's
  name or the breed as first typed.

### When a claim is made

- A row or breed needs **5 visits** (`MIN_VISITS_FOR_PRICE = 5`). A pricing
  claim needs more than the usual `MIN_VISITS_FOR_PATTERN` (3).
- It must be **both** at least **15%** and at least **$10/hr** below its
  benchmark — the anomalies rule, so neither a trivial service nor a noisy one
  is reported.
- A **row's benchmark is the shop rate**. A **breed's benchmark is its own
  row's rate**, so a Doodle is judged against other large dogs on the same
  service, not against nail trims; a breed is only judged when its row has 5
  visits too.

### The suggestion

`roundToStep(benchmarkRate × medianMins / 60 − medianTicket)` — the extra a
typical visit in the group would need to earn the benchmark rate for its
median hands-on time, rounded to the price list's `$5` step. Shown only when
it rounds above zero. For a row it reads as the price; for a breed, as a fee:

- Row: "Full groom, XL earns $52/hr against the shop's $71/hr. At the shop
  rate the time is worth about $165 against a typical $120 today — about $45
  more."
- Breed: "Goldendoodles on Full groom, Large earn $48/hr against $66/hr for
  the size — about $20 more per visit."
- Evidence: "Median 140 min hands-on, 9 visits, last 90 days. List prices
  before discounts."

### Code shape

- `lib/money-per-minute.ts` — pure, no database: the grouping, the weighted
  rate, both thresholds, the 5-visit floor, the suggestion, and the
  `Insight[]` built from them. Takes plain rows
  (`{ workedMins, ticketCents, lines, breedKey, breedLabel }`).
- `lib/money-per-minute-queries.ts` — one query for finished visits with their
  history, lines, surcharges and pet breed; one `guidesForBreeds()` call for
  every breed at once; maps to the pure rows.

### Where it shows

- **Analytics** (`app/staff/analytics/page.tsx`, managers only): a **Money per
  Hour** section after Visit Time. A strip with the shop rate and the visits
  behind it, then a table per service × size: rate, median hands-on minutes,
  median ticket, visits, and the suggestion where one clears. A row under 5
  visits stays listed as "3 measured, 5 needed" with no rate claimed. The
  section follows the page's range, says "list prices before discounts", and
  is absent when nothing was measured — off is silence.
- **Shop insights** (`shopInsights()`): one insight per row or breed that
  clears both thresholds, over the last **90 days**, worst relative gap first,
  **at most 3**. Ids `price-rate:<serviceId>:<size>` and
  `price-breed:<serviceId>:<size>:<breedKey>` so snoozes hold. Each links to
  `/admin/services`, which holds prices and surcharges. Being shop insights,
  they are snoozable and reach the dashboard and the morning digest unchanged.
- **Nothing on customer or pet profiles** — it is a question about the shop's
  prices, not one household's.
- **Nothing is applied.** Once a new price has been charged for a while the
  row rises past the threshold and the insight stops being derived; a snooze
  covers the wait.

## Testing

`lib/money-per-minute.test.ts`, pure:

- Weighted rate: two visits, $60 in 60 min and $30 in 60 min, is $45/hr — and
  $90 in 120 min plus $30 in 10 min is not the average of the two rates.
- Row keys: one-line visits only; add-on visits count toward the shop rate
  only; flat service ignores `sizeTier`; size-priced line with null size and a
  null `serviceId` are left out of the rows.
- The 5-visit floor on rows and breeds, and the breed needing its row to clear
  it too.
- Both thresholds: 20% below but $6/hr is not reported; $12/hr below but 10%
  is not; 20% and $12/hr is.
- A breed is judged against its row, not the shop rate.
- The suggestion rounds to `$5` and is absent when it rounds to zero or below.
- At most 3 insights, worst relative gap first; ids stable.

## Out of scope

- Per-groomer figures — sub-project 3.
- Payments actually taken: a part payment or an unpaid balance is the
  counter's problem, not the price's.
- Cats' flat services are counted like any flat service; no species split.
- Applying a suggested price.
