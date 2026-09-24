# Size from weight

Sub-project 0 of the "insights" roadmap. It comes first because every later
piece that reads revenue (money per minute, churn causes) is wrong until a
booked line carries the price the pet's size actually costs.

## Problem

Weight is stored and displayed but priced nowhere. `resolveSelectedServices()`
in `lib/appointment-services.ts` quotes every line at `serviceFloorCents()` —
the lowest published price — so a 90 lb dog is booked at the Small price. The
public price list hardcodes its size labels in
`components/ServicePricingExplorer.tsx` (`"30–45 lb"`), which already disagrees
with the shop's real rule.

## The shop's rule

Dogs only; cats and every flat-priced service ignore size.

| Size   | Weight            |
|--------|-------------------|
| Small  | under 15 lb       |
| Medium | 15 to under 30 lb |
| Large  | 30 to 50 lb       |
| XL     | over 50 lb        |

So 15 → Medium, 30 → Large, 50 → Large, 50.1 → XL.

## Design

### Cutoffs — typed once

Three `SystemConfig` columns, edited in Shop Settings beside the other
thresholds, defaults matching the table:

- `sizeSmallUnderLbs` = 15
- `sizeMediumUnderLbs` = 30
- `sizeLargeMaxLbs` = 50

Parsed in `saveSettings` and re-ordered defensively (each strictly greater than
the last) like the pickup and arrival thresholds. The names carry the
comparison so the mixed boundary rule is visible where it is used.

### Weight — typed wins, breed estimates, otherwise unknown

Resolved at quote time, never stored as a copy:

1. `Pet.weightLbs` — what the shop typed. The only weight persisted on a pet.
2. `BreedGuide.typicalWeightLbs` — new nullable `Float`, edited at
   `/admin/breeds` beside `typicalMins`, matched through the existing
   `guidesForBreeds()` loose match. Seeded for the breeds already in the guide
   seed. Shown as "~40 lb (breed estimate)".
3. Neither — size unknown.

Correcting a breed's figure therefore re-sizes every un-weighed pet of that
breed on its next quote.

### Pure half — `lib/pet-size.ts`

No database. Exports:

- `PetSize` = `"SMALL" | "MEDIUM" | "LARGE" | "XL"`
- `sizeCutoffs(config)` — reads and orders the three columns.
- `sizeForWeight(lbs, cutoffs): PetSize`
- `petWeight(pet, guide): { lbs: number; estimated: boolean } | null`
- `sizePriceCents(service, size | null): number | null` — the tier column for
  that size on a size-priced service; the flat price otherwise; the floor when
  size is null (today's behaviour).
- `sizeLabel(size, cutoffs)` — "Large (30–50 lb)", used by the public list.

Tested in `lib/pet-size.test.ts`: 14.9 / 15 / 29.9 / 30 / 50 / 50.1, reordered
cutoffs, a cat, a flat service, a missing weight, a breed estimate losing to a
typed weight.

### Quoting

`resolveSelectedServices(serviceIds, petId?)` gains the pet. With a pet, it
loads the pet (species, breed, weight) and its breed guide, resolves the size
once, and prices each line through `sizePriceCents()`. Cats resolve to no size.
Both callers pass it: `createAppointment()` in `lib/create-appointment.ts` (the
portal, staff and walk-in paths all route through it) and `updateServices()` in
`app/staff/appointments/actions.ts`.

New column `AppointmentService.sizeTier` (`PetSize` enum, nullable) snapshots
the size the line was quoted at. Null means flat-priced, a cat, a size that was
unknown, or a line quoted before this change.

**Visits already quoted are not repriced** — same rule as pricing tiers. No
backfill. Later insights that read revenue count only lines with a `sizeTier`
or a flat-priced service.

### Where it shows

- Visit screen and station job aid: the size and where it came from — "Large ·
  42 lb" or "Large · ~40 lb (breed estimate)" or "Size unknown — add a weight".
  The last is the only prompt; nothing else asks for weight.
- Public price list: `ServicePricingExplorer` drops `SIZE_LABELS`' hardcoded
  weights and takes labels from `sizeLabel()` via the page, so the published
  range and the charged price share one source.
- `/admin/breeds` form: one "Typical weight (lb)" input.
- Shop Settings: the three cutoffs.

Nothing is added to the booking forms.

## Out of scope

- Weight history or per-visit weighing — the shop does not weigh pets.
- Changing surcharges, pricing tiers, rewards or commission arithmetic; they
  read `priceCents` as before and simply see the right figure.
- Repricing existing appointments.

## Migration

One migration: three `SystemConfig` columns with defaults, `BreedGuide.typicalWeightLbs`,
the `PetSize` enum and `AppointmentService.sizeTier`. `npm run db:generate`
after. Seed adds typical weights to the seeded breed guides only where the row
has none, so a shop's own figure is never overwritten.
