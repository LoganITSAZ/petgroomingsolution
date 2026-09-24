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
