# Loyalty tiers (rename of PricingTier + auto-earning)

## Problem

`PricingTier` is today a manually-assigned "legacy rate" — an admin puts a
customer on a named discount by hand (`/admin/pricing`), and it stays until
someone changes it. The shop wants a Lowe's-style loyalty program instead:
named tiers (bronze/silver/gold, whatever the shop calls them) that a customer
*earns* by spending with the shop, that can still be hand-assigned by an
admin (comping a customer, or restoring status lost to hardship), and that
the customer can see on their own portal page — including a warning when
their current tier is about to lapse.

This is a rename and extension of `PricingTier`, not a second system: the
existing "named rate off the visit total, snapshotted at booking" mechanics
are exactly what a loyalty discount needs.

## Decisions from discussion

- Full rename: `PricingTier` → `LoyaltyTier` in schema, routes, `lib/`,
  admin UI. Matches the repo's "one screen has one name" convention.
- Earning basis: **trailing 12-month spend**, summed from **list price**
  (`AppointmentService.priceCents`) on finished visits (`COMPLETE`,
  `READY_PICKUP`, `PICKED_UP`) — same "finished" set `lib/rewards.ts` uses.
- A tier can be **auto-eligible** (has a `spendThresholdCents`) or
  **manual-only** (threshold is `null` — the old "Friends & family"-style use
  case; never entered by the auto ladder).
- **Admin assignment is sticky.** `Customer.loyaltyTierSource` is
  `AUTO | MANUAL`. Auto recompute only ever writes when the source is `AUTO`.
  An admin assigning a tier by hand sets source to `MANUAL` and it stays
  there — including for the reparations/hardship-restore case — until an
  admin explicitly resets it back to automatic.
- **Auto tiers can demote**, because trailing spend is a rolling window and
  the whole point of leaving the door open to a manual override is to let a
  manager overrule that when it's unfair (hardship) or reward it beyond what
  spend alone would (reparations).
- Customers can see their status and an at-risk warning in the portal.

## Schema changes

```prisma
model LoyaltyTier {
  id              String       @id @default(cuid())
  name            String       @unique
  discountKind    DiscountKind @default(PERCENT)
  discountPercent Float?
  discountCents   Int?
  spendThresholdCents Int?     // null = manual-only rung; set = auto-ladder rung
  note            String?
  isActive        Boolean      @default(true)
  sortOrder       Int          @default(0)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  customers    Customer[]
  appointments Appointment[]

  @@map("loyalty_tiers")
}

enum LoyaltyTierSource {
  AUTO
  MANUAL
}
```

- `Customer.pricingTierId` → `loyaltyTierId`; add `loyaltyTierSource
  LoyaltyTierSource @default(AUTO)`.
- `Appointment.pricingTierId` / `pricingDiscountCents` →
  `loyaltyTierId` / `loyaltyDiscountCents` (booking-snapshot semantics
  unchanged — see "The snapshot is the point" in CLAUDE.md, applies as-is).
- Table rename `pricing_tiers` → `loyalty_tiers`; column renames on
  `customers` and `appointments`. One migration, no data transform needed
  beyond the renames (`spendThresholdCents` and `loyaltyTierSource` are new,
  nullable/defaulted).

The auto ladder only ever considers *active* tiers with a non-null
`spendThresholdCents`, highest `sortOrder` (equivalently highest threshold —
the admin form should keep them entered in ascending threshold order, same
as today's `sortOrder` display convention) whose threshold is at or below the
trailing spend.

## `lib/loyalty.ts` (renames `lib/pricing-tiers.ts`) and `lib/loyalty-math.ts` (renames `lib/pricing-tiers-math.ts`)

Keep the existing exports (`quoteFor`, `tierDiscountCents`, `describeRate`,
`listTotalCents`, `bookingRateSnapshot`, `listPricingTiers` →
`listLoyaltyTiers`, `tierCustomerCounts`) under their renamed forms — no
behavior change to the discount arithmetic.

New:

```ts
/** Sum of list-price finished visits in the last 365 days. */
async function trailingSpendCents(customerId: string): Promise<number>

/**
 * Recomputes and (if the customer's tier source is AUTO) writes the tier
 * implied by trailing spend. No-op if the customer is on MANUAL, or if the
 * computed tier already matches. Called from changeAppointmentStatus() on
 * every finishing transition, and lazily whenever a customer's profile is
 * read (staff or portal) so decay is visible without waiting on a new visit.
 */
export async function recomputeLoyaltyTier(customerId: string): Promise<void>

export interface LoyaltyStatus {
  enabled: boolean;           // mirrors a feature flag? see "Open question" below
  tier: LoyaltyTier | null;
  source: "AUTO" | "MANUAL";
  trailingSpendCents: number;
  nextTier: LoyaltyTier | null;
  centsToNextTier: number | null;
  atRisk: {
    // Spend that will age out of the 365-day window within the next 30 days.
    rollingOffCents: number;
    rollsOffOn: Date;
    // True when trailingSpend - rollingOffCents would drop below the
    // current tier's threshold.
    wouldDropTier: boolean;
  } | null; // null when nothing is rolling off within the window, or no current tier
}

/** Backs both the portal card and the staff/admin customer-detail badge. */
export async function loyaltyStatusFor(customerId: string): Promise<LoyaltyStatus>
```

`atRisk` computation: pull the customer's finished-visit list totals with
their `completedAt` dates for the last 365 days, split into "aging off in the
next 30 days" (i.e. `completedAt` between 335 and 365 days ago) vs the rest;
if `trailingSpend - rollingOff < currentTier.spendThresholdCents`, flag it
with the date the oldest of those aging-off visits crosses the 365-day line.

## Hook points

- `changeAppointmentStatus()` ([lib/appointment-status.ts](../../../lib/appointment-status.ts)):
  call `recomputeLoyaltyTier(updated.customerId)` alongside the existing
  `syncRewardForVisit()` call, for the same finishing/cancelling statuses.
- Staff customer detail page and portal dashboard: call
  `recomputeLoyaltyTier(customerId)` before reading `loyaltyStatusFor()`, so
  a customer who hasn't visited in months sees an up-to-date (possibly
  demoted) tier rather than a stale one.

## UI changes

- `/admin/pricing` → `/admin/loyalty` (rename all files:
  `app/admin/pricing/{page.tsx,actions.ts,TierFields.tsx}` →
  `app/admin/loyalty/{page.tsx,actions.ts,TierFields.tsx}`). Old path
  redirects, same pattern as the retired `/admin/features`.
- `TierFields` gains a "Spend threshold" dollar input (optional — blank means
  manual-only rung).
- Staff customer detail page: replace the existing "Pricing tier" assignment
  control with a "Loyalty tier" section showing current tier, an "Auto" or
  "Set by staff" badge, an assign dropdown, and (when source is `MANUAL`) a
  "Reset to automatic" action that clears the override and immediately
  reruns `recomputeLoyaltyTier`.
- Portal (`app/portal/page.tsx`): new `LoyaltyStatusCard` component,
  `PageSection` placed next to the existing rewards `PageSection`, showing
  the current tier name, a progress indicator toward `nextTier` (amount of
  spend still needed), and — only when `atRisk.wouldDropTier` — a warning
  line naming the tier and the date it may lapse.

## Other reference renames (mechanical, no behavior change)

`app/api/appointments/route.ts`, `app/api/walk-in/route.ts`,
`app/staff/customers/actions.ts`, `app/staff/customers/page.tsx`,
`app/staff/customers/[id]/page.tsx`, `app/staff/appointments/new/page.tsx`,
`app/staff/appointments/[id]/page.tsx`, `prisma/demo.ts` — every
`pricingTier`/`PricingTier`/`pricing-tiers` reference becomes
`loyaltyTier`/`LoyaltyTier`/`loyalty`.

## Open question for implementation plan

Does loyalty display need its own `SystemConfig` feature flag
(`featureLoyalty`, matching the `featureRewards` pattern), or is it always-on
once any `LoyaltyTier` rows exist (mirroring how `PricingTier` has no flag
today)? Recommend: no new flag — a shop with no tiers configured just shows
nothing, same as `PricingTier` today; keep it consistent with the thing it
replaces rather than adding a toggle nobody asked for.
