"use client";

import { useMemo, useState } from "react";

type PetType = "DOG" | "CAT";
type DogSize = "priceSmallCents" | "priceMediumCents" | "priceLargeCents" | "priceXlCents";

export interface PricingService {
  id: string;
  name: string;
  description: string | null;
  category: string;
  species: string | null;
  priceSmallCents: number | null;
  priceMediumCents: number | null;
  priceLargeCents: number | null;
  priceXlCents: number | null;
  priceFlatCents: number | null;
  priceMaxCents: number | null;
  durationMins: number | null;
  walkInEligible: boolean;
  offers: { title: string; code: string | null }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  GROOM: "Grooming",
  BATH: "Bathing & care",
  NAILS: "Nails & paws",
  DENTAL: "Teeth & ears",
  EARS: "Teeth & ears",
  ADD_ON: "Add-ons",
  OTHER: "More care",
};

const SIZE_LABELS = [
  ["Small", "Under 15 lb", "priceSmallCents"],
  ["Medium", "15–30 lb", "priceMediumCents"],
  ["Large", "30–45 lb", "priceLargeCents"],
  ["XL", "50+ lb", "priceXlCents"],
] as const;

const DOG_SIZES: { value: DogSize; label: string; detail: string }[] = SIZE_LABELS.map(
  ([label, detail, value]) => ({ value, label, detail })
);

function money(cents: number | null): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function priceLabel(service: PricingService): string {
  const prices = [
    service.priceSmallCents,
    service.priceMediumCents,
    service.priceLargeCents,
    service.priceXlCents,
    service.priceFlatCents,
    service.priceMaxCents,
  ].filter((value): value is number => value != null);

  if (prices.length === 0) return "Price on request";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

export default function ServicePricingExplorer({ services }: { services: PricingService[] }) {
  const [petType, setPetType] = useState<PetType | null>(null);
  const [dogSize, setDogSize] = useState<DogSize | null>(null);
  const readyToShowPrices = petType === "CAT" || (petType === "DOG" && dogSize !== null);
  const matching = useMemo(
    () => services.filter((service) => service.species === petType || service.species === null),
    [petType, services]
  );
  const grouped = useMemo(() => {
    const result = new Map<string, PricingService[]>();
    for (const service of matching) {
      const category = CATEGORY_LABELS[service.category] ?? "Services";
      result.set(category, [...(result.get(category) ?? []), service]);
    }
    return result;
  }, [matching]);

  return (
    <section aria-labelledby="pricing-tool-heading" className="glass-panel rounded-3xl p-4 md:p-6">
      <div className="flex flex-col gap-4 border-b border-line pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="pricing-tool-heading" className="text-xl font-black tracking-tight text-ink">
            Find the right services
          </h2>
          <p className="mt-0.5 text-sm text-muted">Choose your pet to personalize the menu.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-100/35 p-1" role="tablist" aria-label="Pet type">
          {([
            ["DOG", "🐶", "Dog"],
            ["CAT", "🐱", "Cat"],
          ] as const).map(([type, icon, label]) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={petType === type}
              onClick={() => {
                setPetType(type);
                if (type === "CAT") setDogSize(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                petType === type
                  ? "bg-surface text-brand-text shadow-md shadow-brand-900/10"
                  : "text-muted hover:bg-surface/60 hover:text-ink"
              }`}
            >
              <span className="mr-1.5" aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
        </div>
        {petType === "DOG" ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span>Weight</span>
            <select
              value={dogSize ?? ""}
              onChange={(event) => setDogSize(event.target.value ? event.target.value as DogSize : null)}
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm font-medium text-ink shadow-sm"
            >
              <option value="" disabled>Select range</option>
              {DOG_SIZES.map((size) => (
                <option key={size.value} value={size.value}>{size.label} · {size.detail}</option>
              ))}
            </select>
          </label>
        ) : null}
        </div>
      </div>

      {!petType && (
        <p className="mt-4 rounded-xl bg-brand-100/30 px-4 py-3 text-sm text-muted">
          Start by selecting whether you&apos;re bringing a dog or a cat.
        </p>
      )}
      {petType === "DOG" && !dogSize && (
        <p className="mt-4 rounded-xl bg-brand-100/30 px-4 py-3 text-sm text-muted">
          Select your dog&apos;s weight range to see the prices that apply.
        </p>
      )}
      {readyToShowPrices && (
        <>
        <p className="mt-4 text-sm text-muted">
          <span className="font-bold text-brand-text">{matching.length} services</span> for {petType === "DOG" ? "dogs" : "cats"} — species-specific and all-pet care.
        </p>

      <div key={`${petType}-${dogSize ?? ""}`} role="tabpanel" className="mt-4 space-y-5">
        {Array.from(grouped).map(([category, categoryServices]) => (
          <div key={category}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-text">{category}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {categoryServices.map((service) => {
                const hasSizePrices = petType === "DOG" && dogSize !== null && SIZE_LABELS.some(([, , field]) => service[field] != null);
                const selectedSize = dogSize ? DOG_SIZES.find((size) => size.value === dogSize)! : null;
                const selectedPrice = hasSizePrices ? service[dogSize] : null;
                return (
                  <article key={service.id} className="rounded-xl border border-line bg-surface/60 p-4 shadow-sm transition hover:border-brand-300/70 hover:shadow-md hover:shadow-brand-900/5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-ink">{service.name}</h4>
                        {service.description && <p className="mt-0.5 text-sm leading-relaxed text-muted">{service.description}</p>}
                      </div>
                      <span className="shrink-0 text-lg font-black text-brand-text">
                        {hasSizePrices ? money(selectedPrice) : priceLabel(service)}
                      </span>
                    </div>

                    {hasSizePrices && selectedSize && <p className="mt-1 text-xs text-muted">{selectedSize.label} dog · {selectedSize.detail}</p>}

                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      {service.species === null && <span className="rounded-full bg-brand-100/60 px-2 py-0.5 font-semibold text-brand-text">All pets</span>}
                      {service.walkInEligible && <span className="rounded-full bg-brand-100/60 px-2 py-0.5 font-semibold text-brand-text">Walk-in</span>}
                      {service.durationMins && <span className="rounded-full bg-page px-2 py-0.5 font-medium text-muted">{service.durationMins} min</span>}
                      {service.offers.map((offer) => <span key={`${offer.title}-${offer.code ?? ""}`} className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{offer.title}{offer.code ? ` · ${offer.code}` : ""}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </section>
  );
}
