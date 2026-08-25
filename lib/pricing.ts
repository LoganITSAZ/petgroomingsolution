import { PricingMode, ServiceCategory, ServiceType, type Service } from "@prisma/client";

/** Money is stored in cents everywhere. Format whole dollars, cents only when non-zero. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/** Parse a dollars string from a form into cents. Empty or unparseable → null. */
export function parseDollarsToCents(value: FormDataEntryValue | null): number | null {
  const raw = ((value as string | null) ?? "").trim().replace(/^\$/, "");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/** Cents → the value a dollars input should show. */
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toString();
}

type PricedService = Pick<
  Service,
  | "priceSmallCents"
  | "priceMediumCents"
  | "priceLargeCents"
  | "priceXlCents"
  | "priceFlatCents"
  | "priceMaxCents"
>;

/** Every price actually set on a service, smallest first. */
export function servicePrices(service: PricedService): number[] {
  return [
    service.priceSmallCents,
    service.priceMediumCents,
    service.priceLargeCents,
    service.priceXlCents,
    service.priceFlatCents,
    service.priceMaxCents,
  ]
    .filter((cents): cents is number => cents != null)
    .sort((a, b) => a - b);
}

/** What the shop charges, as a customer-facing string. */
export function servicePriceLabel(service: PricedService): string {
  const prices = servicePrices(service);
  if (prices.length === 0) return "Price on request";

  const low = prices[0];
  const high = prices[prices.length - 1];
  return low === high ? formatCents(low) : `${formatCents(low)}–${formatCents(high)}`;
}

/** True when the service is priced by pet size rather than flat. */
export function isSizePriced(service: PricedService): boolean {
  return (
    service.priceSmallCents != null ||
    service.priceMediumCents != null ||
    service.priceLargeCents != null ||
    service.priceXlCents != null
  );
}

/**
 * Lowest published price, used for revenue estimates. Deliberately the floor:
 * actual tickets depend on pet size and surcharges, so anything derived from
 * this must be labelled as a list-price estimate.
 */
export function serviceFloorCents(service: PricedService): number | null {
  const prices = servicePrices(service);
  return prices.length > 0 ? prices[0] : null;
}

/** Shops quote in round money — every derived price lands on a $5 step. */
export const PRICE_STEP_CENTS = 500;

export function roundToStep(cents: number, step: number = PRICE_STEP_CENTS): number {
  return Math.max(step, Math.round(cents / step) * step);
}

export interface BasePricingInput {
  basePriceCents: number | null;
  mediumMultiplier: number;
  largeMultiplier: number;
  xlMultiplier: number;
}

/**
 * Size tiers derived from a single base price. Raising or lowering the base
 * moves every size with it, which is how the shop actually reprices.
 */
export function tiersFromBase(input: BasePricingInput): {
  priceSmallCents: number | null;
  priceMediumCents: number | null;
  priceLargeCents: number | null;
  priceXlCents: number | null;
} {
  const base = input.basePriceCents;
  if (base == null || base <= 0) {
    return {
      priceSmallCents: null,
      priceMediumCents: null,
      priceLargeCents: null,
      priceXlCents: null,
    };
  }
  return {
    priceSmallCents: roundToStep(base),
    priceMediumCents: roundToStep(base * input.mediumMultiplier),
    priceLargeCents: roundToStep(base * input.largeMultiplier),
    priceXlCents: roundToStep(base * input.xlMultiplier),
  };
}

/** True when this service's sizes are driven by its base price. */
export function isBasePriced(service: Pick<Service, "pricingMode">): boolean {
  return service.pricingMode === PricingMode.BASE;
}

/** Shop-facing categories, and the reporting type each one maps onto. */
export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  GROOM: "Grooming",
  BATH: "Bathing",
  NAILS: "Nails",
  DENTAL: "Teeth",
  EARS: "Ears",
  ADD_ON: "Add-on",
  OTHER: "Other",
};

const CATEGORY_TYPE: Record<ServiceCategory, ServiceType> = {
  GROOM: ServiceType.FULL_GROOM,
  BATH: ServiceType.BATH_AND_TIDY,
  NAILS: ServiceType.NAIL_TRIM,
  DENTAL: ServiceType.TEETH_BRUSHING,
  EARS: ServiceType.EAR_CLEANING,
  ADD_ON: ServiceType.ADD_ON,
  OTHER: ServiceType.CUSTOM,
};

export function typeForCategory(category: ServiceCategory): ServiceType {
  return CATEGORY_TYPE[category];
}
