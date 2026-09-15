# Vaccination gate (cluster 4)

## Problem

`Pet.vaccinationsConfirmedAt` is one timestamp meaning "somebody saw some
paperwork once". A grooming shop's actual obligation is narrower and dated:
rabies is law in most places, kennel cough matters because the pets share a
kennel bank, and each shot *expires*. One timestamp cannot say which vaccine,
cannot expire, and cannot be enforced — so today the shop's own waiver claims
pets are current and nothing in the app knows whether they are.

Two costs. A pet with a rabies certificate that lapsed eighteen months ago
gets groomed beside other people's dogs, and a shop asked to prove what it
checked has one date and no document trail.

## Decisions

- **Requirements are rows, not a flag list.** `VaccineRequirement` — a name,
  a species, whether it is active. No rows means no gate: the emptiness rule
  from the registry, so a shop that does not check anything is not asked to
  switch six things off. A shop that checks only rabies has one row.
- **A record is per pet, per requirement, with an expiry.**
  `PetVaccination` points at the requirement it satisfies, carries `expiresOn`,
  and records who verified it and when. `expiresOn` is a **date the shop was
  told**, not a computed one: a three-year rabies and a one-year bordetella
  are both normal and the certificate says which.
- **The gate warns before it refuses, and refusing is opt-in.**
  `featureVaccinationGate` turns the checking on; `vaccinationGateBlocks`
  decides whether a customer-facing booking is *refused* or merely flagged to
  staff. Default: on, not blocking. A shop that has never recorded a
  vaccination must not discover the feature by having its diary refuse every
  booking on the day it upgrades.
- **Staff are never blocked.** The same rule `enforceCustomerRules` already
  encodes in `createAppointment()`: a person at the counter is the shop's
  problem to solve, not the software's to refuse. Staff see the warning and
  book anyway. Only portal booking and the walk-in portal can be refused.
- **Grace is a number, not a judgement.** `vaccinationGraceDays` (default 0)
  lets a shop take a booking for a pet whose shot lapsed last week while the
  owner gets to the vet. `expiringSoonDays` is fixed at 30 in code — it changes
  nothing about what is allowed, only when the shop starts asking.
- **`offMeans: "accrues"`.** Records and expiries keep being written while the
  feature is off; only the gate and the badges go. A shop switching it on
  should find the history it has been keeping, not an empty table.
- **`Pet.vaccinationsConfirmedAt` stays.** It is what the shop has for every
  existing pet, it is on the kiosk and two other screens, and deleting it
  would throw away the only record those pets have. It now reads as "proof
  seen" — a fallback line, shown when a pet has no itemised records.

## Schema

```prisma
model VaccineRequirement {
  id        String   @id @default(cuid())
  /// What the shop calls it on the certificate: "Rabies", "Bordetella".
  name      String
  species   Species
  /// Retiring a requirement leaves the records behind it readable.
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  records PetVaccination[]

  @@unique([name, species])
  @@map("vaccine_requirements")
}

model PetVaccination {
  id            String    @id @default(cuid())
  petId         String
  requirementId String
  /// The date on the certificate. Null means the shop saw proof with no date
  /// on it -- which counts as current but never expires, so it is flagged.
  expiresOn     DateTime?
  verifiedAt    DateTime  @default(now())
  verifiedById  String?
  note          String?

  pet         Pet                @relation(fields: [petId], references: [id], onDelete: Cascade)
  requirement VaccineRequirement @relation(fields: [requirementId], references: [id])
  verifiedBy  Staff?             @relation(fields: [verifiedById], references: [id])

  @@unique([petId, requirementId])
  @@index([expiresOn])
  @@map("pet_vaccinations")
}
```

`@@unique([petId, requirementId])` keeps one row per pet per vaccine: a
renewal **updates** the row rather than stacking a history. The shop's
question is always "is this pet current", and a stack of expired rows is a
document archive this app is not.

`SystemConfig` gains `featureVaccinationGate Boolean @default(true)`,
`vaccinationGateBlocks Boolean @default(false)` and
`vaccinationGraceDays Int @default(0)`.

## `lib/vaccinations.ts`

Pure decisions, database queries at the bottom — the shape of
`lib/visit-record.ts` and `lib/visit-photos.ts`.

```ts
export type VaccineLevel = "current" | "undated" | "expiring" | "lapsed" | "missing";

export interface VaccineCheck {
  requirementId: string;
  name: string;
  level: VaccineLevel;
  expiresOn: Date | null;
  /** Days until expiry; negative once lapsed. Null when undated or missing. */
  daysLeft: number | null;
}

/** One pet against the shop's active requirements for its species. */
export function checkVaccinations(input: {
  requirements: { id: string; name: string; species: Species }[];
  records: { requirementId: string; expiresOn: Date | null }[];
  species: Species;
  today: Date;
  graceDays: number;
}): VaccineCheck[];

/** What stops a booking: lapsed past the grace, or never recorded. */
export function vaccinationBlockers(checks: VaccineCheck[]): VaccineCheck[];

/** The worst level present, for a badge. Null when there is nothing to say. */
export function worstLevel(checks: VaccineCheck[]): VaccineLevel | null;
```

`graceDays` moves the lapse line, not the label: a pet three days past a
one-day grace reads `lapsed` either way, but only the ungraced one blocks.
That distinction is why `vaccinationBlockers()` is separate from the levels —
a screen shows what is wrong; the gate decides what is fatal.

## The gate

Same four layers the registry names.

1. **Nav** — `/admin/vaccinations` carries `feature: "featureVaccinationGate"`,
   the first consumer of the nav field added in cluster 0.
2. **Page** — `/admin/vaccinations` redirects to `/admin/settings` when the
   feature is off, the way `/staff/analytics` redirects a non-manager.
3. **Mutation** — `createAppointment()` refuses with a new
   `VACCINATION_REQUIRED` code, but **only** when
   `enforceCustomerRules && config.featureVaccinationGate &&
   config.vaccinationGateBlocks`. The requirement mutations on the admin screen
   call `requireManager()` and `requireFeature("featureVaccinationGate")`.
4. **Embedded surfaces** — the badge on the pet page, the visit screen, the
   station job aid, the staff booking form and the owner's portal.

The walk-in route goes through `createAppointment()` already, so it inherits
the refusal without a second copy of the rule.

## Where it shows

| Surface | What |
|---|---|
| `/admin/vaccinations` | The requirements list: add, rename, retire; blocking and grace settings link back to `/admin/settings` |
| `/staff/pets/[id]` | A row per requirement with its expiry, and the form to record or renew one |
| `/staff/appointments/[id]` | A banner when anything is lapsed or missing |
| `/staff/appointments/new` | The same banner under the pet picker, never a refusal |
| `/staff/stations/[id]` | A lapsed line on the job aid, beside the health flags |
| `/portal/pets` | What the shop needs from the owner, with dates |
| `/station/[id]` kiosk | Unchanged: it keeps showing "proof confirmed" |

## Testing

`lib/vaccinations.test.ts`, pure: a current shot, one expiring inside 30 days,
one lapsed, an undated record, a requirement with no record at all, a
requirement for the other species ignored, grace days moving what blocks
without moving the label, `worstLevel()` ordering, and the boundary cases at
exactly today and exactly the grace day — `SHOP_TIMEZONE` day boundaries are
the easiest thing in this codebase to get wrong, so every date in the tests is
built with `shopMoment()`-style wall-clock intent and compared through
`shopDayKey()`.

## Out of scope

- No certificate upload. The shop looks at paper at the counter; storing the
  document is a records-retention question nobody has asked about.
- No reminder emails. Rebooking cadence (cluster 5) is where scheduled
  outbound mail gets designed; a one-off mailer here would be a second system.
- No per-service requirements. A shop that wants a nail trim exempt from
  kennel cough can retire the requirement or book it as staff.
