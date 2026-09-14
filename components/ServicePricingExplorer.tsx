"use client";

import { useMemo, useState, type ReactNode } from "react";

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

export default function ServicePricingExplorer({ services, extras }: { services: PricingService[]; extras?: ReactNode }) {
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
  const selectedSize = dogSize ? DOG_SIZES.find((size) => size.value === dogSize)! : null;

  // The panel swaps its contents in place — the questions collapse into a chip
  // row and the results scroll inside a fixed region — so answering never grows
  // the page under the reader.
  return (
    <section
      aria-labelledby="pricing-tool-heading"
      className="relative flex min-h-[34rem] flex-col overflow-hidden p-5 md:min-h-[38rem] md:p-8"
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-brand-300/25 blur-3xl" />

      {!readyToShowPrices ? (
        <div className="relative flex flex-1 flex-col justify-center">
          <div className="mx-auto max-w-2xl text-center">
            <p className="public-eyebrow mb-4">Your pet&apos;s price guide</p>
            <h2 id="pricing-tool-heading" className="text-3xl font-black tracking-tight text-ink md:text-4xl">
              Let&apos;s find the right care
            </h2>
            <p className="mt-2 text-muted">Answer a couple of quick questions and we&apos;ll simplify the menu for you.</p>
          </div>
          <div className="mx-auto mt-8 w-full max-w-3xl">
            <div className="mb-4 flex items-center justify-center gap-2 text-xs font-bold tracking-tight text-brand-text">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-brand-on-600">1</span>
              Choose your pet
              {petType === "DOG" && <><span className="mx-1 h-px w-8 bg-brand-300" /><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-brand-on-600">2</span> Choose weight</>}
            </div>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Choose your pet type">
              {([
                ["DOG", "🐶", "Dog"],
                ["CAT", "🐱", "Cat"],
              ] as const).map(([type, icon, label]) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={petType === type}
                  onClick={() => {
                    setPetType(type);
                    if (type === "CAT" || petType !== type) setDogSize(null);
                  }}
                  className={`glass-choice group relative overflow-hidden rounded-2xl border p-4 text-left transition duration-200 md:p-6 ${
                    petType === type
                      ? "border-brand-500 bg-brand-100/60 text-brand-text shadow-lg shadow-brand-900/10"
                      : "border-well-line bg-well/70 text-ink hover:-translate-y-0.5 hover:border-brand-300 hover:bg-surface hover:shadow-lg hover:shadow-brand-900/5"
                  }`}
                >
                  <span className="block text-5xl transition duration-200 group-hover:scale-110" aria-hidden="true">{icon}</span>
                  <span className="mt-3 block text-lg font-black">I have a {label.toLowerCase()}</span>
                  <span className="mt-1 block text-sm font-medium text-muted">See care and pricing for {label.toLowerCase()}s</span>
                  {petType === type && <span aria-hidden="true" className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-brand-on-600">✓</span>}
                </button>
              ))}
            </div>
            {petType === "DOG" ? (
              <div className="mt-6 rounded-2xl border border-brand-300/70 bg-well/60 p-4 md:p-5">
                <div className="mb-3 text-center">
                  <p className="text-lg font-black text-ink">How much does your dog weigh?</p>
                  <p className="text-sm text-muted">Choose the closest range to reveal their prices.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Choose your dog's weight range">
                  {DOG_SIZES.map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      aria-pressed={dogSize === size.value}
                      onClick={() => setDogSize(size.value)}
                      className={`rounded-xl border px-3 py-3 text-center transition ${
                        dogSize === size.value
                          ? "border-brand-500 bg-brand-600 text-brand-on-600 shadow-md"
                          : "border-well-line bg-well/80 text-ink hover:border-brand-300 hover:bg-brand-100/30"
                      }`}
                    >
                      <span className="block font-black">{size.label}</span>
                      <span className={`mt-0.5 block text-xs ${dogSize === size.value ? "text-brand-on-600" : "text-muted"}`}>{size.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-4 rounded-xl bg-brand-100/30 px-4 py-3 text-center text-sm text-muted" aria-live="polite">
              {petType === "DOG"
                ? "Select your dog's weight range to see the prices that apply."
                : "Start by selecting whether you're bringing a dog or a cat."}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 pb-4">
            <h2 id="pricing-tool-heading" className="mr-auto text-lg font-black tracking-tight text-ink">
              Prices for your {petType === "DOG" ? "dog" : "cat"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setPetType(null);
                setDogSize(null);
              }}
              className="rounded-full border border-brand-300 bg-brand-100/50 px-3 py-1 text-sm font-semibold text-brand-text transition hover:bg-brand-100"
            >
              {petType === "DOG" ? "🐶 Dog" : "🐱 Cat"} · change
            </button>
            {selectedSize && (
              <button
                type="button"
                onClick={() => setDogSize(null)}
                className="rounded-full border border-brand-300 bg-brand-100/50 px-3 py-1 text-sm font-semibold text-brand-text transition hover:bg-brand-100"
              >
                {selectedSize.label} · {selectedSize.detail} · change
              </button>
            )}
          </div>

          <p className="py-3 text-sm text-muted" aria-live="polite">
            <span className="font-bold text-brand-text">{matching.length} services</span> selected for your{" "}
            {petType === "DOG" ? "dog" : "cat"}.
          </p>

          <div key={`${petType}-${dogSize ?? ""}`} className="-mr-2 flex-1 space-y-5 overflow-y-auto pr-2">
            {Array.from(grouped).map(([category, categoryServices]) => (
              <div key={category}>
                <h3 className="mb-2 text-xs font-bold tracking-tight text-brand-text">{category}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {categoryServices.map((service) => {
                    const hasSizePrices = petType === "DOG" && dogSize !== null && SIZE_LABELS.some(([, , field]) => service[field] != null);
                    const selectedPrice = hasSizePrices && dogSize ? service[dogSize] : null;
                    return (
                      <article key={service.id} className="glass-tile rounded-xl border border-well-line bg-well/70 p-4 shadow-sm transition hover:border-brand-300/70 hover:shadow-md hover:shadow-brand-900/5">
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

          {/* Surcharges only mean something beside a price, so they arrive with
          the prices rather than sitting under an unanswered tool. */}
          {extras}
        </div>
      )}
    </section>
  );
}
