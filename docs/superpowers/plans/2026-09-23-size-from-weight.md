# Size from Weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quote each size-priced service at the pet's actual size, derived from its typed weight or its breed's typical weight, instead of the lowest published price.

**Architecture:** A dependency-free `lib/pet-size.ts` turns a weight and three shop cutoffs into a size. `quoteLine()` in `lib/pricing.ts` turns a service and a size into a price plus the size it was quoted at. `resolveSelectedServices()` — the one function every booking path already calls — resolves the pet's size once and prices every line through `quoteLine()`, snapshotting `AppointmentService.sizeTier`. The cutoffs live on `SystemConfig`; the breed estimate is a new `BreedGuide.typicalWeightLbs`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 5 / PostgreSQL, Vitest (+ jsdom for component tests).

**Spec:** `docs/superpowers/specs/2026-09-23-size-from-weight-design.md`

## Global Constraints

- Dogs only are sized. `Species.CAT` and `Species.OTHER` resolve to no size; flat-priced services ignore size.
- Boundaries: Small `< 15`, Medium `< 30`, Large `<= 50`, XL `> 50`. 15 → Medium, 30 → Large, 50 → Large, 50.1 → XL.
- Defaults: `sizeSmallUnderLbs = 15`, `sizeMediumUnderLbs = 30`, `sizeLargeMaxLbs = 50`. Each must be strictly greater than the one before; out-of-order values are nudged up, never rejected.
- A typed `Pet.weightLbs` always beats `BreedGuide.typicalWeightLbs`. The estimate is never written onto the pet.
- Visits already quoted are never repriced. No backfill of `AppointmentService`.
- `lib/pet-size.ts` imports nothing at runtime — it is read by a client component.
- Money is cents. `AppointmentService.priceCents` stays the list price (now at the pet's size).
- Nothing is added to any booking form.
- The working tree carries unrelated uncommitted edits. Every commit stages **only the files the task lists** — never `git add -A` or `git add .`.

## Review Focus

- **A breed guide matched loosely to a different-sized variety** ("Toy Poodle" matching the "Poodle" guide) would quote a 6 lb dog at XL. Seeded weights are therefore left null for breeds that come in several sizes (Poodle, Goldendoodle, Schnauzer); the shop adds a "Toy Poodle" guide, and an exact match wins in `guidesForBreeds()`. Pinned by Task 6's seed data, not by a test — flag in review if a seeded weight is set on a multi-size breed.
- **A size-priced service with no column for the pet's size** (Large left blank) must not quote null or zero — it falls back to the floor with `sizeTier: null`. Test in Task 2.
- **Cutoffs saved out of order** must not produce an empty size. Test in Task 1 (`sizeCutoffs` reorders).
- **A cat on a size-priced "any species" service** gets the floor, not a size. Test in Task 1 (`sizePet` returns null for CAT/OTHER) and Task 2 (null size → floor).
- **Changing services on an existing visit** (`updateServices`) re-quotes those lines at the pet's current size. That is intended: staff chose to change the lines. Unchanged visits are untouched.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/pet-size.ts` (create) | Pure: cutoffs, weight → size, pet → sized pet, display strings. No imports. |
| `lib/pet-size.test.ts` (create) | Boundary tests. |
| `lib/pricing.ts` (modify) | `quoteLine()` — service + size → price and snapshot tier. |
| `lib/pricing.test.ts` (modify) | `quoteLine()` tests. |
| `prisma/schema.prisma` (modify) | 3 `SystemConfig` columns, `BreedGuide.typicalWeightLbs`, `PetSize` enum, `AppointmentService.sizeTier`. |
| `prisma/migrations/<ts>_size_from_weight/migration.sql` (create) | Generated. |
| `lib/appointment-services.ts` (modify) | `sizePetById()`; `resolveSelectedServices(ids, petId?)` prices by size. |
| `lib/create-appointment.ts` (modify) | Passes `petId`; legacy fallback line priced by size. |
| `app/staff/appointments/actions.ts` (modify) | `updateServices` passes the visit's `petId`. |
| `app/admin/settings/page.tsx` (modify) | Parse, save and edit the three cutoffs. |
| `app/admin/breeds/actions.ts`, `app/admin/breeds/page.tsx` (modify) | Typical weight input, validation, list display. |
| `prisma/seed.ts` (modify) | Typical weights for single-size breeds, filled only where null. |
| `app/staff/appointments/[id]/page.tsx` (modify) | Pet line shows size + source; service lines show quoted size. |
| `app/staff/stations/[id]/page.tsx` (modify) | Job aid shows size + source. |
| `components/ServicePricingExplorer.tsx`, `.test.tsx` (modify) | Size ranges from cutoffs. |
| `app/(public)/services/page.tsx` (modify) | Passes cutoffs. |
| `CLAUDE.md` (modify) | Architecture note. |

---

### Task 1: Pure size arithmetic

**Files:**
- Create: `lib/pet-size.ts`
- Test: `lib/pet-size.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PetSize = "SMALL" | "MEDIUM" | "LARGE" | "XL"`
  - `const PET_SIZES: readonly PetSize[]`
  - `interface SizeCutoffs { smallUnder: number; mediumUnder: number; largeMax: number }`
  - `const DEFAULT_SIZE_CUTOFFS: SizeCutoffs`
  - `sizeCutoffs(config: { sizeSmallUnderLbs: number; sizeMediumUnderLbs: number; sizeLargeMaxLbs: number }): SizeCutoffs`
  - `sizeForWeight(lbs: number, cutoffs: SizeCutoffs): PetSize`
  - `interface SizedPet { size: PetSize; lbs: number; estimated: boolean }`
  - `sizePet(pet: { species: string; weightLbs: number | null }, guide: { typicalWeightLbs: number | null } | null | undefined, cutoffs: SizeCutoffs): SizedPet | null`
  - `sizeName(size: PetSize): string` — "Small" / "Medium" / "Large" / "XL"
  - `sizeRange(size: PetSize, cutoffs: SizeCutoffs): string` — "Under 15 lb" / "15–30 lb" / "30–50 lb" / "Over 50 lb"
  - `describeSize(sized: SizedPet | null, species: string): string | null` — "Large · 42 lb", "Large · ~40 lb (breed estimate)", "Size unknown — add a weight" (dogs with nothing), `null` for non-dogs.

- [ ] **Step 1: Write the failing test**

Create `lib/pet-size.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIZE_CUTOFFS,
  describeSize,
  sizeCutoffs,
  sizeForWeight,
  sizePet,
  sizeRange,
} from "./pet-size";

const cutoffs = DEFAULT_SIZE_CUTOFFS;

describe("sizeForWeight", () => {
  it.each([
    [1, "SMALL"],
    [14.9, "SMALL"],
    [15, "MEDIUM"],
    [29.9, "MEDIUM"],
    [30, "LARGE"],
    [50, "LARGE"],
    [50.1, "XL"],
    [120, "XL"],
  ] as const)("%s lb is %s", (lbs, size) => {
    expect(sizeForWeight(lbs, cutoffs)).toBe(size);
  });
});

describe("sizeCutoffs", () => {
  it("reads the three columns", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 10, sizeMediumUnderLbs: 25, sizeLargeMaxLbs: 60 })
    ).toEqual({ smallUnder: 10, mediumUnder: 25, largeMax: 60 });
  });

  it("nudges out-of-order values up so no size is empty", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 30, sizeMediumUnderLbs: 20, sizeLargeMaxLbs: 10 })
    ).toEqual({ smallUnder: 30, mediumUnder: 31, largeMax: 32 });
  });

  it("falls back to defaults for nonsense", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 0, sizeMediumUnderLbs: NaN, sizeLargeMaxLbs: -5 })
    ).toEqual(DEFAULT_SIZE_CUTOFFS);
  });
});

describe("sizePet", () => {
  it("uses the typed weight over the breed estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: 12 }, { typicalWeightLbs: 70 }, cutoffs)).toEqual({
      size: "SMALL",
      lbs: 12,
      estimated: false,
    });
  });

  it("falls back to the breed estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: null }, { typicalWeightLbs: 65 }, cutoffs)).toEqual({
      size: "XL",
      lbs: 65,
      estimated: true,
    });
  });

  it("is null for a dog with no weight and no estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: null }, null, cutoffs)).toBeNull();
    expect(sizePet({ species: "DOG", weightLbs: null }, { typicalWeightLbs: null }, cutoffs)).toBeNull();
  });

  it("never sizes a cat or other pet", () => {
    expect(sizePet({ species: "CAT", weightLbs: 60 }, null, cutoffs)).toBeNull();
    expect(sizePet({ species: "OTHER", weightLbs: 60 }, null, cutoffs)).toBeNull();
  });

  it("ignores a non-positive weight", () => {
    expect(sizePet({ species: "DOG", weightLbs: 0 }, { typicalWeightLbs: 20 }, cutoffs)).toEqual({
      size: "MEDIUM",
      lbs: 20,
      estimated: true,
    });
  });
});

describe("labels", () => {
  it("draws ranges from the cutoffs", () => {
    expect(sizeRange("SMALL", cutoffs)).toBe("Under 15 lb");
    expect(sizeRange("MEDIUM", cutoffs)).toBe("15–30 lb");
    expect(sizeRange("LARGE", cutoffs)).toBe("30–50 lb");
    expect(sizeRange("XL", cutoffs)).toBe("Over 50 lb");
  });

  it("describes where the size came from", () => {
    expect(describeSize({ size: "LARGE", lbs: 42, estimated: false }, "DOG")).toBe("Large · 42 lb");
    expect(describeSize({ size: "LARGE", lbs: 40, estimated: true }, "DOG")).toBe(
      "Large · ~40 lb (breed estimate)"
    );
    expect(describeSize(null, "DOG")).toBe("Size unknown — add a weight");
    expect(describeSize(null, "CAT")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pet-size.test.ts`
Expected: FAIL — `Failed to resolve import "./pet-size"`.

- [ ] **Step 3: Write the implementation**

Create `lib/pet-size.ts`:

```ts
/**
 * A dog's size, derived from its weight.
 *
 * The shop sizes by weight and prices by size, so the weight is the fact and
 * the size is arithmetic. A typed weight wins; otherwise the breed guide's
 * typical weight stands in and is labelled an estimate; otherwise the size is
 * unknown and the quote falls back to the lowest price, as it always did.
 *
 * No imports: the public price list reads this in a client component.
 */

export type PetSize = "SMALL" | "MEDIUM" | "LARGE" | "XL";
export const PET_SIZES: readonly PetSize[] = ["SMALL", "MEDIUM", "LARGE", "XL"];

/** Small is under `smallUnder`, Medium under `mediumUnder`, Large up to `largeMax`. */
export interface SizeCutoffs {
  smallUnder: number;
  mediumUnder: number;
  largeMax: number;
}

export const DEFAULT_SIZE_CUTOFFS: SizeCutoffs = { smallUnder: 15, mediumUnder: 30, largeMax: 50 };

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The shop's three columns, re-ordered defensively so no size is empty. */
export function sizeCutoffs(config: {
  sizeSmallUnderLbs: number;
  sizeMediumUnderLbs: number;
  sizeLargeMaxLbs: number;
}): SizeCutoffs {
  const smallUnder = positive(config.sizeSmallUnderLbs, DEFAULT_SIZE_CUTOFFS.smallUnder);
  const mediumUnder = Math.max(
    smallUnder + 1,
    positive(config.sizeMediumUnderLbs, DEFAULT_SIZE_CUTOFFS.mediumUnder)
  );
  const largeMax = Math.max(
    mediumUnder + 1,
    positive(config.sizeLargeMaxLbs, DEFAULT_SIZE_CUTOFFS.largeMax)
  );
  return { smallUnder, mediumUnder, largeMax };
}

export function sizeForWeight(lbs: number, cutoffs: SizeCutoffs): PetSize {
  if (lbs < cutoffs.smallUnder) return "SMALL";
  if (lbs < cutoffs.mediumUnder) return "MEDIUM";
  if (lbs <= cutoffs.largeMax) return "LARGE";
  return "XL";
}

export interface SizedPet {
  size: PetSize;
  lbs: number;
  estimated: boolean;
}

/** Dogs only. Null when there is no weight to go on. */
export function sizePet(
  pet: { species: string; weightLbs: number | null },
  guide: { typicalWeightLbs: number | null } | null | undefined,
  cutoffs: SizeCutoffs
): SizedPet | null {
  if (pet.species !== "DOG") return null;
  if (pet.weightLbs != null && pet.weightLbs > 0) {
    return { size: sizeForWeight(pet.weightLbs, cutoffs), lbs: pet.weightLbs, estimated: false };
  }
  const typical = guide?.typicalWeightLbs;
  if (typical != null && typical > 0) {
    return { size: sizeForWeight(typical, cutoffs), lbs: typical, estimated: true };
  }
  return null;
}

const NAMES: Record<PetSize, string> = { SMALL: "Small", MEDIUM: "Medium", LARGE: "Large", XL: "XL" };

export function sizeName(size: PetSize): string {
  return NAMES[size];
}

export function sizeRange(size: PetSize, cutoffs: SizeCutoffs): string {
  switch (size) {
    case "SMALL":
      return `Under ${cutoffs.smallUnder} lb`;
    case "MEDIUM":
      return `${cutoffs.smallUnder}–${cutoffs.mediumUnder} lb`;
    case "LARGE":
      return `${cutoffs.mediumUnder}–${cutoffs.largeMax} lb`;
    case "XL":
      return `Over ${cutoffs.largeMax} lb`;
  }
}

/** One line for the visit screen and the job aid. Null where size means nothing. */
export function describeSize(sized: SizedPet | null, species: string): string | null {
  if (species !== "DOG") return null;
  if (!sized) return "Size unknown — add a weight";
  const weight = sized.estimated ? `~${sized.lbs} lb (breed estimate)` : `${sized.lbs} lb`;
  return `${sizeName(sized.size)} · ${weight}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pet-size.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/pet-size.ts lib/pet-size.test.ts
git commit -m "feat(pricing): a dog's size is derived from its weight"
```

---

### Task 2: Quote a line at a size

**Files:**
- Modify: `lib/pricing.ts` (add after `serviceFloorCents`, ~line 76)
- Test: `lib/pricing.test.ts`

**Interfaces:**
- Consumes: `PetSize` from `lib/pet-size.ts` (Task 1).
- Produces: `quoteLine(service: PricedService, size: PetSize | null): { priceCents: number | null; sizeTier: PetSize | null }`. `sizeTier` is non-null only when the price came from that size's column.

- [ ] **Step 1: Write the failing test**

Append to `lib/pricing.test.ts` (add `quoteLine` to the existing import from `./pricing`):

```ts
describe("quoteLine", () => {
  const sized = {
    priceSmallCents: 4500,
    priceMediumCents: 6000,
    priceLargeCents: null,
    priceXlCents: 10000,
    priceFlatCents: null,
    priceMaxCents: null,
  };
  const flat = {
    priceSmallCents: null,
    priceMediumCents: null,
    priceLargeCents: null,
    priceXlCents: null,
    priceFlatCents: 1500,
    priceMaxCents: null,
  };

  it("prices a size-priced service at the pet's size", () => {
    expect(quoteLine(sized, "MEDIUM")).toEqual({ priceCents: 6000, sizeTier: "MEDIUM" });
    expect(quoteLine(sized, "XL")).toEqual({ priceCents: 10000, sizeTier: "XL" });
  });

  it("falls back to the floor when the size has no price", () => {
    expect(quoteLine(sized, "LARGE")).toEqual({ priceCents: 4500, sizeTier: null });
  });

  it("falls back to the floor when the size is unknown", () => {
    expect(quoteLine(sized, null)).toEqual({ priceCents: 4500, sizeTier: null });
  });

  it("ignores size on a flat service", () => {
    expect(quoteLine(flat, "XL")).toEqual({ priceCents: 1500, sizeTier: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pricing.test.ts`
Expected: FAIL — `quoteLine is not a function` (or not exported).

- [ ] **Step 3: Write the implementation**

In `lib/pricing.ts`, add to the imports:

```ts
import type { PetSize } from "@/lib/pet-size";
```

and after `serviceFloorCents`:

```ts
const SIZE_COLUMN: Record<PetSize, keyof PricedService> = {
  SMALL: "priceSmallCents",
  MEDIUM: "priceMediumCents",
  LARGE: "priceLargeCents",
  XL: "priceXlCents",
};

/**
 * What one booked line costs for a pet of this size. The size is recorded only
 * when it set the price — a flat service, an unknown size or a size the shop
 * left unpriced all quote the floor, as every line did before sizes existed.
 */
export function quoteLine(
  service: PricedService,
  size: PetSize | null
): { priceCents: number | null; sizeTier: PetSize | null } {
  const atSize = size && isSizePriced(service) ? service[SIZE_COLUMN[size]] : null;
  if (size && atSize != null) return { priceCents: atSize, sizeTier: size };
  return { priceCents: serviceFloorCents(service), sizeTier: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pricing.ts lib/pricing.test.ts
git commit -m "feat(pricing): quote a line at the pet's size"
```

---

### Task 3: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_size_from_weight/migration.sql` (generated)

**Interfaces:**
- Produces: `SystemConfig.sizeSmallUnderLbs`, `sizeMediumUnderLbs`, `sizeLargeMaxLbs` (`Int`); `BreedGuide.typicalWeightLbs` (`Float?`); Prisma enum `PetSize { SMALL MEDIUM LARGE XL }`; `AppointmentService.sizeTier` (`PetSize?`).

- [ ] **Step 1: Edit the schema**

In `model SystemConfig`, directly after `pickupCriticalMins Int @default(240)`:

```prisma

  // Dog sizes by weight. Small is under the first, Medium under the second,
  // Large up to and including the third, XL over it. Cats are flat-priced.
  sizeSmallUnderLbs  Int @default(15)
  sizeMediumUnderLbs Int @default(30)
  sizeLargeMaxLbs    Int @default(50)
```

In `model BreedGuide`, directly after `typicalMins Int?`:

```prisma
  // Typical adult weight, standing in for a pet nobody has weighed. Left
  // blank for breeds that come in several sizes — a Toy Poodle is not a
  // Standard, and a wrong estimate is worse than none.
  typicalWeightLbs Float?
```

In `model AppointmentService`, directly after `priceCents Int? // snapshot of the quoted price`:

```prisma
  // The size that set priceCents. Null for flat services, cats, an unknown
  // size, and every line quoted before sizes were derived.
  sizeTier      PetSize?
```

Add the enum next to the other enums (e.g. after `enum PricingMode { ... }`):

```prisma
enum PetSize {
  SMALL
  MEDIUM
  LARGE
  XL
}
```

- [ ] **Step 2: Create and inspect the migration**

Run: `npx prisma migrate dev --name size_from_weight --create-only`
Expected: a new folder `prisma/migrations/*_size_from_weight/` whose `migration.sql` contains only: `CREATE TYPE "PetSize"`, three `ALTER TABLE "system_config" ADD COLUMN ... DEFAULT`, one `ALTER TABLE "breed_guides" ADD COLUMN "typicalWeightLbs"`, one `ALTER TABLE "appointment_services" ADD COLUMN "sizeTier"`. (Table names follow each model's `@@map`.) If it contains anything else — drops, renames — stop and report; the schema has drifted.

- [ ] **Step 3: Apply and regenerate**

Run: `npx prisma migrate dev && npm run db:generate`
Expected: "Your database is now in sync with your schema." and the client regenerates.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If TS2802 appears, delete `tsconfig.tsbuildinfo` and rerun.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/*_size_from_weight
git commit -m "feat(db): size cutoffs, breed weight, and the size a line was quoted at"
```

---

### Task 4: Quote by size on every booking path

**Files:**
- Modify: `lib/appointment-services.ts:16-68`
- Modify: `lib/create-appointment.ts:158-190`
- Modify: `app/staff/appointments/actions.ts:357-363`

**Interfaces:**
- Consumes: `sizeCutoffs`, `sizePet`, `SizedPet` (Task 1); `quoteLine` (Task 2); `guidesForBreeds` from `lib/breeds.ts`; `getConfig` from `lib/config.ts`.
- Produces:
  - `sizePetById(petId: string): Promise<SizedPet | null>` exported from `lib/appointment-services.ts`.
  - `resolveSelectedServices(serviceIds: string[], petId?: string | null): Promise<ResolvedServices | null>`.
  - `ResolvedServices["lines"][number]` gains `sizeTier: PetSize | null`.

- [ ] **Step 1: Size the pet and price by it in `lib/appointment-services.ts`**

Replace the imports' `serviceFloorCents` line with:

```ts
import { quoteLine } from "@/lib/pricing";
import { sizeCutoffs, sizePet, type PetSize, type SizedPet } from "@/lib/pet-size";
import { guidesForBreeds } from "@/lib/breeds";
```

`serviceFloorCents` is still used by `getServiceOptions()` — keep it imported: `import { quoteLine, serviceFloorCents } from "@/lib/pricing";`.

Add `sizeTier: PetSize | null;` to the line shape in `ResolvedServices`.

Add above `resolveSelectedServices`:

```ts
/** A pet's size for quoting, from its own weight or its breed's. */
export async function sizePetById(petId: string): Promise<SizedPet | null> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { species: true, breed: true, weightLbs: true },
  });
  if (!pet) return null;
  const [config, guides] = await Promise.all([getConfig(), guidesForBreeds([pet.breed])]);
  const guide = pet.breed ? guides.get(pet.breed.trim().toLowerCase()) : undefined;
  return sizePet(pet, guide, sizeCutoffs(config));
}
```

Change the signature and the loop body of `resolveSelectedServices`:

```ts
export async function resolveSelectedServices(
  serviceIds: string[],
  petId?: string | null
): Promise<ResolvedServices | null> {
  const ids = serviceIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;

  const [services, sized] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: ids } } }),
    petId ? sizePetById(petId) : null,
  ]);
  const byId = new Map(services.map((service) => [service.id, service]));

  const lines: ResolvedServices["lines"] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const service = byId.get(id);
    if (!service || seen.has(service.id)) continue;
    seen.add(service.id);
    lines.push({
      serviceId: service.id,
      serviceType: service.type,
      ...quoteLine(service, sized?.size ?? null),
      sortOrder: lines.length,
    });
  }
  // ...rest unchanged
```

Update the doc comment above it with one sentence: "With a pet, size-priced lines are quoted at that pet's size."

- [ ] **Step 2: Pass the pet in `lib/create-appointment.ts`**

Line 158 becomes:

```ts
  const resolved = await resolveSelectedServices(input.serviceIds ?? [], input.petId);
```

Add `sizeTier: PetSize | null;` to the local `lines` type (after `priceCents: number | null;`), importing `type PetSize` from `@/lib/pet-size`.

Replace the legacy fallback block (`if (lines.length === 0) { ... }`) so it prices by size too:

```ts
  if (lines.length === 0) {
    const [catalogService, sized] = await Promise.all([
      prisma.service.findFirst({
        where: { type: serviceType, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      sizePetById(input.petId),
    ]);
    lines = [
      {
        serviceId: catalogService?.id ?? null,
        serviceType,
        ...(catalogService
          ? quoteLine(catalogService, sized?.size ?? null)
          : { priceCents: null, sizeTier: null }),
        sortOrder: 0,
      },
    ];
  }
```

Import `sizePetById` from `@/lib/appointment-services` (add to the existing import) and `quoteLine` from `@/lib/pricing`. Remove the `serviceFloorCents` import if it is now unused (lint fails the build on unused imports).

- [ ] **Step 3: Pass the pet in `updateServices`**

In `app/staff/appointments/actions.ts`, replace the body's first lines:

```ts
  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { petId: true },
  });
  // A visit that no longer exists has nothing to re-quote; the page's existing
  // message is the nearest honest one.
  if (!appointment) back(appointmentId, "?error=no_services");
  const services = await resolveSelectedServices(
    formData.getAll("serviceIds").map((value) => String(value)),
    appointment.petId
  );
```

`back()` returns `never`, so `appointment` narrows after the guard. `no_services` is an existing key in the visit page's error map.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

Manual check against the test database (`npm run dev:test`): book a dog with `weightLbs` 42 for a size-priced groom from `/staff/appointments/new`; its visit screen line shows the Large price. Query to confirm: `npx prisma studio` → `appointment_services` newest row has `sizeTier = LARGE`.

- [ ] **Step 5: Commit**

```bash
git add lib/appointment-services.ts lib/create-appointment.ts app/staff/appointments/actions.ts
git commit -m "feat(booking): every line is quoted at the pet's size"
```

---

### Task 5: The cutoffs in Shop Settings

**Files:**
- Modify: `app/admin/settings/page.tsx` (parse ~line 90, save ~line 178, UI after the "Pickup Waits" `Section` ~line 637)

**Interfaces:**
- Consumes: `SystemConfig.sizeSmallUnderLbs` / `sizeMediumUnderLbs` / `sizeLargeMaxLbs` (Task 3).

- [ ] **Step 1: Parse, ordered like the other thresholds**

After the `pickupCriticalMins` line:

```ts
  // Dog sizes escalate like the thresholds above, so they are nudged into
  // order rather than refused.
  const sizeSmallUnderLbs = Math.max(1, parseInt((formData.get("sizeSmallUnderLbs") as string) ?? "15", 10) || 15);
  const sizeMediumUnderLbs = Math.max(sizeSmallUnderLbs + 1, parseInt((formData.get("sizeMediumUnderLbs") as string) ?? "30", 10) || 30);
  const sizeLargeMaxLbs = Math.max(sizeMediumUnderLbs + 1, parseInt((formData.get("sizeLargeMaxLbs") as string) ?? "50", 10) || 50);
```

Add `sizeSmallUnderLbs, sizeMediumUnderLbs, sizeLargeMaxLbs,` to the `data` object after `pickupCriticalMins,`. Add `revalidatePath("/services");` beside the other `revalidatePath` calls so the public price list picks the new ranges up.

- [ ] **Step 2: The section**

After the closing `</Section>` of "Pickup Waits":

```tsx
        <Section
          title="Dog Sizes"
          hint="Weights that decide which size price a dog is quoted. Cats and flat-priced services ignore them."
        >
          <Field name="sizeSmallUnderLbs" label="Small is under (lb)">
            <input type="number" id="sizeSmallUnderLbs" name="sizeSmallUnderLbs" defaultValue={config?.sizeSmallUnderLbs ?? 15} min={1} max={300} className={FIELD} />
          </Field>

          <Field name="sizeMediumUnderLbs" label="Medium is under (lb)">
            <input type="number" id="sizeMediumUnderLbs" name="sizeMediumUnderLbs" defaultValue={config?.sizeMediumUnderLbs ?? 30} min={2} max={300} className={FIELD} />
          </Field>

          <Field name="sizeLargeMaxLbs" label="Large is up to (lb)" hint="Anything heavier is XL.">
            <input type="number" id="sizeLargeMaxLbs" name="sizeLargeMaxLbs" defaultValue={config?.sizeLargeMaxLbs ?? 50} min={3} max={300} className={FIELD} />
          </Field>

          <ThresholdLiveWarning
            fieldIds={["sizeSmallUnderLbs", "sizeMediumUnderLbs", "sizeLargeMaxLbs"]}
            message="These will be reordered on save to keep small < medium < large."
          />
        </Section>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.
Manual: `/admin/settings` shows "Dog Sizes" with 15 / 30 / 50; save 30 / 20 / 10 and reload — it shows 30 / 31 / 32.

- [ ] **Step 4: Commit**

```bash
git add app/admin/settings/page.tsx
git commit -m "feat(settings): the shop's dog size cutoffs"
```

---

### Task 6: Typical weight on the breed guide

**Files:**
- Modify: `app/admin/breeds/actions.ts:30-50`
- Modify: `app/admin/breeds/page.tsx` (error map ~line 22, form ~line 58, list row ~line 188)
- Modify: `prisma/seed.ts` (guide objects 226-385, upsert loop 387-395)

**Interfaces:**
- Consumes: `BreedGuide.typicalWeightLbs` (Task 3).

- [ ] **Step 1: Validate and save it**

In `app/admin/breeds/actions.ts`, after the `typicalMins` check:

```ts
  const weightRaw = ((formData.get("typicalWeightLbs") as string | null) ?? "").trim();
  const typicalWeightLbs = weightRaw ? Number(weightRaw) : null;
  if (typicalWeightLbs != null && (!Number.isFinite(typicalWeightLbs) || typicalWeightLbs <= 0)) {
    done("?error=bad_weight");
  }
```

Add `typicalWeightLbs,` to `data` after `typicalMins,`.

- [ ] **Step 2: The input, the error, the list**

In `app/admin/breeds/page.tsx`, add to the error map after `bad_minutes`:

```ts
  bad_weight: "Typical weight must be a positive number of pounds.",
```

After the "Typical minutes" `<label>`:

```tsx
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Typical weight (lb)</span>
          <input
            name="typicalWeightLbs"
            inputMode="decimal"
            defaultValue={guide?.typicalWeightLbs ?? ""}
            className={inputClass}
          />
          <span className="block text-xs text-stone-500 mt-1">
            Sizes a dog nobody has weighed. Leave blank for breeds that come in several sizes.
          </span>
        </label>
```

If the grid holding "Typical minutes" is a fixed column count, add one column so the new label sits beside it rather than wrapping.

In the list row, after `{guide.typicalMins && ...}`:

```tsx
                  {guide.typicalWeightLbs && ` · ~${guide.typicalWeightLbs} lb`}
```

- [ ] **Step 3: Seed single-size breeds**

In `prisma/seed.ts`, add `typicalWeightLbs` to these guide objects (after `typicalMins`), and **no field** on the others:

| Breed | `typicalWeightLbs` |
|---|---|
| Golden Retriever | 65 |
| German Shepherd | 75 |
| Shih Tzu | 12 |
| Yorkshire Terrier | 6 |
| Labrador Retriever | 65 |
| Australian Shepherd | 50 |
| Maltese | 7 |

Poodle, Goldendoodle and Schnauzer stay blank (several sizes); Persian and Domestic Shorthair are cats.

Change the upsert loop so an existing guide gets the weight only when it has none:

```ts
  for (const guide of breedGuides) {
    await prisma.breedGuide.upsert({
      where: { breed: guide.breed },
      // The guide text is the shop's once it exists; the stock photo is ours to
      // fill in, so a shop that seeded before this column existed still gets one.
      update: { photoUrl: guide.photoUrl },
      create: guide,
    });
    // Same for the typical weight, but never over a figure the shop typed.
    if ("typicalWeightLbs" in guide) {
      await prisma.breedGuide.updateMany({
        where: { breed: guide.breed, typicalWeightLbs: null },
        data: { typicalWeightLbs: guide.typicalWeightLbs },
      });
    }
  }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run db:seed`
Expected: clean; seed prints "✓ 12 breed guides". `/admin/breeds` shows "~65 lb" on Golden Retriever and nothing on Poodle. Editing a guide to weight `abc` shows the bad_weight message.

- [ ] **Step 5: Commit**

```bash
git add app/admin/breeds/actions.ts app/admin/breeds/page.tsx prisma/seed.ts
git commit -m "feat(breeds): a typical weight sizes a dog nobody has weighed"
```

---

### Task 7: Show the size where the visit is worked

**Files:**
- Modify: `app/staff/appointments/[id]/page.tsx` (pet line ~407-409, service line price ~682)
- Modify: `app/staff/stations/[id]/page.tsx` (pet facts ~411-418)

**Interfaces:**
- Consumes: `sizeCutoffs`, `sizePet`, `describeSize`, `sizeName` (Task 1); `guidesForBreeds` (`lib/breeds.ts`); `AppointmentService.sizeTier` (Task 3).

- [ ] **Step 1: Visit screen — pet line**

In `app/staff/appointments/[id]/page.tsx`, import:

```ts
import { guidesForBreeds } from "@/lib/breeds";
import { describeSize, sizeCutoffs, sizeName, sizePet } from "@/lib/pet-size";
```

After `const config = await getConfig();` (~line 243):

```ts
  const breedGuide = appointment.pet.breed
    ? (await guidesForBreeds([appointment.pet.breed])).get(appointment.pet.breed.trim().toLowerCase())
    : undefined;
  const sizeLine = describeSize(
    sizePet(appointment.pet, breedGuide, sizeCutoffs(config)),
    appointment.pet.species
  );
```

Replace line 409 (`{appointment.pet.weightLbs ? ... : ""}`) with:

```tsx
                    {sizeLine
                      ? ` · ${sizeLine}`
                      : appointment.pet.weightLbs
                        ? ` · ${appointment.pet.weightLbs} lb`
                        : ""}
```

(The fallback keeps a cat's typed weight visible.)

- [ ] **Step 2: Visit screen — service lines**

Replace the price cell (~line 682):

```tsx
                  <span className="text-stone-500 whitespace-nowrap">
                    {line.priceCents == null
                      ? "—"
                      : line.sizeTier
                        ? `${formatCents(line.priceCents)} · ${sizeName(line.sizeTier)}`
                        : `from ${formatCents(line.priceCents)}`}
                  </span>
```

A line quoted at a size is that size's list price, so "from" goes; an unsized line is still the floor and keeps it.

- [ ] **Step 3: Station job aid**

In `app/staff/stations/[id]/page.tsx`, import `describeSize, sizeCutoffs, sizePet` from `@/lib/pet-size`. `guides` (line 134) and `config` (line 142) already exist; compute `const cutoffs = sizeCutoffs(config);` after `config`. Replace the weight entry in the facts array (~line 416):

```tsx
                                describeSize(
                                  sizePet(
                                    appt.pet,
                                    appt.pet.breed ? guides.get(appt.pet.breed.trim().toLowerCase()) : undefined,
                                    cutoffs
                                  ),
                                  appt.pet.species
                                ) ?? (appt.pet.weightLbs ? `${appt.pet.weightLbs} lb` : null),
```

If `config` is declared after the JSX-producing code path that needs it, move `const cutoffs` to just after it — do not re-fetch the config.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.
Manual (`npm run dev:test`): a Labrador with no weight shows "XL · ~65 lb (breed estimate)" on its visit screen and station; a dog of an unknown breed with no weight shows "Size unknown — add a weight"; a cat shows its weight or nothing.

- [ ] **Step 5: Commit**

```bash
git add "app/staff/appointments/[id]/page.tsx" "app/staff/stations/[id]/page.tsx"
git commit -m "feat(visit): the size a dog is quoted at, and where it came from"
```

---

### Task 8: The public price list reads the cutoffs

**Files:**
- Modify: `components/ServicePricingExplorer.tsx:36-45, 69`
- Modify: `components/ServicePricingExplorer.test.tsx`
- Modify: `app/(public)/services/page.tsx:88`

**Interfaces:**
- Consumes: `SizeCutoffs`, `DEFAULT_SIZE_CUTOFFS`, `sizeCutoffs`, `sizeRange`, `sizeName`, `PetSize` (Task 1).
- Produces: `ServicePricingExplorer` prop `cutoffs: SizeCutoffs` (required).

- [ ] **Step 1: Update the test to expect the shop's ranges**

In `components/ServicePricingExplorer.test.tsx`, import `DEFAULT_SIZE_CUTOFFS` from `@/lib/pet-size`, pass `cutoffs={DEFAULT_SIZE_CUTOFFS}` to every `render(<ServicePricingExplorer ... />)`, and change

```ts
    fireEvent.click(screen.getByRole("button", { name: "Large 30–45 lb" }));
```

to

```ts
    fireEvent.click(screen.getByRole("button", { name: "Large 30–50 lb" }));
```

Add a test:

```ts
  it("draws the size ranges from the shop's cutoffs", () => {
    render(
      <ServicePricingExplorer services={services} cutoffs={{ smallUnder: 10, mediumUnder: 25, largeMax: 60 }} />
    );
    expect(screen.getByRole("button", { name: "Small Under 10 lb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XL Over 60 lb" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/ServicePricingExplorer.test.tsx`
Expected: FAIL — no button named "Large 30–50 lb" / "Small Under 10 lb".

- [ ] **Step 3: Derive the labels**

In `components/ServicePricingExplorer.tsx`, import:

```ts
import { PET_SIZES, sizeName, sizeRange, type PetSize, type SizeCutoffs } from "@/lib/pet-size";
```

Replace `SIZE_LABELS` and `DOG_SIZES` with:

```ts
const SIZE_FIELD: Record<PetSize, DogSize> = {
  SMALL: "priceSmallCents",
  MEDIUM: "priceMediumCents",
  LARGE: "priceLargeCents",
  XL: "priceXlCents",
};
const SIZE_FIELDS = Object.values(SIZE_FIELD);
```

Change the signature to take `cutoffs`:

```tsx
export default function ServicePricingExplorer({ services, extras, cutoffs }: { services: PricingService[]; extras?: ReactNode; cutoffs: SizeCutoffs }) {
```

and inside it, before `selectedSize`:

```ts
  const dogSizes = PET_SIZES.map((size) => ({ value: SIZE_FIELD[size], label: sizeName(size), detail: sizeRange(size, cutoffs) }));
```

Replace `DOG_SIZES.find(` with `dogSizes.find(`, `DOG_SIZES.map(` with `dogSizes.map(`, and `SIZE_LABELS.some(([, , field]) => service[field] != null)` with `SIZE_FIELDS.some((field) => service[field] != null)`.

- [ ] **Step 4: Pass the cutoffs from the page**

In `app/(public)/services/page.tsx`, import `sizeCutoffs` from `@/lib/pet-size` and add the prop at line 88:

```tsx
          <ServicePricingExplorer
            services={serviceOptions}
            cutoffs={sizeCutoffs(config)}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run components/ServicePricingExplorer.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS and clean. `grep -rn "ServicePricingExplorer" app components` shows no other render site missing `cutoffs` (tsc would fail if one did).

- [ ] **Step 6: Commit**

```bash
git add components/ServicePricingExplorer.tsx components/ServicePricingExplorer.test.tsx "app/(public)/services/page.tsx"
git commit -m "feat(public): the price list's size ranges are the shop's cutoffs"
```

---

### Task 9: Document it and run the full check

**Files:**
- Modify: `CLAUDE.md` (new subsection after "### Pricing is base-driven, pay is commission")

- [ ] **Step 1: Add the section**

```markdown
### A dog is quoted at its size, and its size is its weight

Every size-priced line is quoted at the pet's size, not the floor. The shop
types three cutoffs once in Shop Settings (`sizeSmallUnderLbs` /
`sizeMediumUnderLbs` / `sizeLargeMaxLbs`: Small under, Medium under, Large up
to, XL over), and the public price list's ranges are drawn from the same
columns, so the published label and the price charged cannot disagree.

- **The weight is the fact, the size is arithmetic.** `sizePet()` in
  [lib/pet-size.ts](lib/pet-size.ts) takes the typed `Pet.weightLbs`, then the
  breed guide's `typicalWeightLbs` (labelled an estimate everywhere it shows),
  then gives up. The estimate is never written onto the pet. Dogs only.
- **Breeds that come in several sizes carry no typical weight.** The guide
  match is loose, so "Toy Poodle" finds "Poodle"; a Standard's weight on it
  would quote a six-pound dog at XL. The shop adds the variety as its own guide.
- `resolveSelectedServices(ids, petId)` prices every line through `quoteLine()`
  in [lib/pricing.ts](lib/pricing.ts) and snapshots `AppointmentService.sizeTier`
  — non-null only when the size set the price. Lines quoted before this carry
  null and were never repriced; anything reading revenue by size filters on it.
```

- [ ] **Step 2: Full check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean, all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: a dog is quoted at its size"
```
