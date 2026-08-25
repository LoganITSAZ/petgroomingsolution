import { prisma } from "@/lib/prisma";
import {
  PricingMode,
  ServiceCategory,
  Species,
  type Service,
  type Surcharge,
} from "@prisma/client";
import {
  SERVICE_CATEGORY_LABEL,
  centsToInput,
  formatCents,
  isBasePriced,
  servicePriceLabel,
} from "@/lib/pricing";
import PricingFields from "./PricingFields";
import { formatSpecies } from "@/lib/utils";
import { PageShell, PageSection } from "@/components/ui";
import {
  adjustBasePrices,
  createService,
  deleteService,
  deleteSurcharge,
  saveSurcharge,
  updateService,
} from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Services" };

/**
 * The service catalog drives the public pricing page, the booking forms and
 * the revenue estimates in analytics. It is the one place prices are edited.
 */

const NOTICES: Record<string, string> = {
  duplicate_name: "Another service already uses that name.",
  name_required: "A service needs a name.",
  invalid_type: "Pick a service category.",
  invalid_species: "Pick a valid species, or leave it open to any.",
  invalid_duration: "Duration must be a whole number of minutes.",
  invalid_sort: "Sort order must be a number.",
  label_required: "A surcharge needs a label.",
  base_required: "Enter a base price, or switch to typing each price.",
  bad_percent: "Enter a percentage to move prices by.",
  percent_too_big: "Percentage changes are capped at 50% in one go.",
};

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

function ServiceFields({ service }: { service?: Service }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Name</span>
          <input name="name" required defaultValue={service?.name ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Category</span>
          <select
            name="category"
            defaultValue={service?.category ?? ServiceCategory.GROOM}
            className={inputClass}
          >
            {Object.values(ServiceCategory).map((category) => (
              <option key={category} value={category}>
                {SERVICE_CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Species</span>
          <select name="species" defaultValue={service?.species ?? ""} className={inputClass}>
            <option value="">Any</option>
            {Object.values(Species).map((species) => (
              <option key={species} value={species}>
                {formatSpecies(species)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Description</span>
        <textarea
          name="description"
          rows={2}
          defaultValue={service?.description ?? ""}
          className={`${inputClass} resize-y`}
        />
        <span className="block text-xs text-stone-400 mt-1">Shown to customers.</span>
      </label>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Staff notes</span>
        <textarea
          name="staffNotes"
          rows={2}
          defaultValue={service?.staffNotes ?? ""}
          placeholder="How it is done, what to watch for, what to charge extra for…"
          className={`${inputClass} resize-y`}
        />
        <span className="block text-xs text-stone-400 mt-1">
          Internal only — staff screens and the booked visit. Never shown on the public site.
        </span>
      </label>

      <PricingFields
        initial={{
          pricingMode: service?.pricingMode ?? PricingMode.BASE,
          base: centsToInput(service?.basePriceCents),
          mediumMultiplier: service?.mediumMultiplier ?? 1.33,
          largeMultiplier: service?.largeMultiplier ?? 1.87,
          xlMultiplier: service?.xlMultiplier ?? 2.53,
          small: centsToInput(service?.priceSmallCents),
          medium: centsToInput(service?.priceMediumCents),
          large: centsToInput(service?.priceLargeCents),
          xl: centsToInput(service?.priceXlCents),
          flat: centsToInput(service?.priceFlatCents),
          max: centsToInput(service?.priceMaxCents),
        }}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Minutes</span>
          <input
            name="durationMins"
            inputMode="numeric"
            defaultValue={service?.durationMins ?? ""}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Sort order</span>
          <input
            name="sortOrder"
            inputMode="numeric"
            defaultValue={service?.sortOrder ?? 0}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="walkInEligible"
            defaultChecked={service?.walkInEligible ?? false}
            className="accent-amber-700"
          />
          Available as a walk-in
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={service?.isActive ?? true}
            className="accent-amber-700"
          />
          Listed and bookable
        </label>
      </div>
    </div>
  );
}

function SurchargeRow({ surcharge }: { surcharge?: Surcharge }) {
  return (
    <form action={saveSurcharge} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
      {surcharge && <input type="hidden" name="id" value={surcharge.id} />}
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Label</span>
        <input name="label" required defaultValue={surcharge?.label ?? ""} className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">From</span>
        <input name="min" inputMode="decimal" defaultValue={centsToInput(surcharge?.minCents)} className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">To</span>
        <input name="max" inputMode="decimal" defaultValue={centsToInput(surcharge?.maxCents)} className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Sort</span>
        <input name="sortOrder" inputMode="numeric" defaultValue={surcharge?.sortOrder ?? 0} className={inputClass} />
      </label>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={surcharge?.isActive ?? true}
            className="accent-amber-700"
          />
          Listed
        </label>
        <button
          type="submit"
          className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-2 rounded-lg text-xs font-semibold"
        >
          {surcharge ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

interface PageProps {
  searchParams: {
    saved?: string;
    error?: string;
    deleted?: string;
    retired?: string;
    adjusted?: string;
    percent?: string;
  };
}

export default async function AdminServicesPage({ searchParams }: PageProps) {
  const [services, surcharges, bookedCounts] = await Promise.all([
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.surcharge.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.appointmentService.groupBy({ by: ["serviceId"], _count: { _all: true } }),
  ]);

  const bookedByService = new Map(
    bookedCounts.filter((row) => row.serviceId).map((row) => [row.serviceId as string, row._count._all])
  );
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;

  const groups: { heading: string; items: Service[] }[] = [
    { heading: "Dogs", items: services.filter((s) => s.species === Species.DOG) },
    { heading: "Cats", items: services.filter((s) => s.species === Species.CAT) },
    { heading: "Any pet", items: services.filter((s) => s.species === null) },
    { heading: "Other", items: services.filter((s) => s.species === Species.OTHER) },
  ].filter((group) => group.items.length > 0);

  return (
    <PageShell
      title="Services & Pricing"
      subtitle="Edited here, shown on the public pricing page, offered in booking forms, and used for revenue estimates in analytics."
    >

      {searchParams.saved && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Saved {searchParams.saved === "surcharge" ? "surcharge" : searchParams.saved}.
        </p>
      )}
      {searchParams.adjusted && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Repriced {searchParams.adjusted} service
          {searchParams.adjusted === "1" ? "" : "s"} by {searchParams.percent}%.
        </p>
      )}
      {searchParams.deleted === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Removed.
        </p>
      )}
      {searchParams.retired === "1" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          That service has already been booked, so it was retired instead of deleted — past
          appointments keep their history.
        </p>
      )}
      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      {/* Move every base price at once */}
      <form
        action={adjustBasePrices}
        className="border-t border-stone-100 bg-stone-50 px-3 py-2 flex flex-wrap items-center gap-3"
      >
        <span className="text-sm font-semibold text-stone-800">Adjust all base prices</span>
        <span className="flex items-center gap-2">
          <input
            name="percent"
            aria-label="Adjust all base prices by percent"
            inputMode="decimal"
            placeholder="5"
            className="w-20 border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <span className="text-sm text-stone-500">%</span>
        </span>
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          Apply
        </button>
        <span className="text-xs text-stone-400">
          Applies to base-priced services only. Use a negative number to come down.
        </span>
      </form>

      {/* Add */}
      <details className="border-t border-stone-100">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-stone-800">
          + Add a service
        </summary>
        <form action={createService} className="px-6 pb-6 space-y-4 border-t border-stone-100 pt-4">
          <ServiceFields />
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
            >
              Add Service
            </button>
          </div>
        </form>
      </details>

      {/* Catalog */}
      {services.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No services in the catalog yet.
        </PageSection>
      ) : (
        groups.map((group) => (
          <PageSection
            key={group.heading}
            title={group.heading}
            padded={false}
            bodyClassName="divide-y divide-stone-100 border-t border-stone-100 mt-2"
          >
              {group.items.map((service) => {
                const booked = bookedByService.get(service.id) ?? 0;
                return (
                  <details key={service.id}>
                    <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-semibold text-stone-900">{service.name}</span>
                        {!service.isActive && (
                          <span className="ml-2 text-[10px] font-bold text-stone-400 uppercase">
                            Retired
                          </span>
                        )}
                        {service.walkInEligible && (
                          <span className="ml-2 text-[10px] font-bold text-emerald-700 uppercase">
                            Walk-in
                          </span>
                        )}
                        <span className="block text-xs text-stone-400">
                          {SERVICE_CATEGORY_LABEL[service.category]}
                          {service.durationMins ? ` · ${service.durationMins} min` : ""}
                          {isBasePriced(service) && service.basePriceCents != null
                            ? ` · base ${formatCents(service.basePriceCents)}`
                            : ""}
                          {booked > 0 ? ` · booked ${booked}×` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-medium text-stone-700 whitespace-nowrap">
                        {servicePriceLabel(service)}
                      </span>
                    </summary>
                    <div className="px-5 pb-5 border-t border-stone-100 pt-4 space-y-4">
                      <form action={updateService} className="space-y-3">
                        <input type="hidden" name="id" value={service.id} />
                        <ServiceFields service={service} />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                      <form action={deleteService} className="flex justify-end">
                        <input type="hidden" name="id" value={service.id} />
                        <button
                          type="submit"
                          className="text-xs text-stone-400 hover:text-red-600 underline"
                        >
                          {booked > 0 ? "Retire this service" : "Delete this service"}
                        </button>
                      </form>
                    </div>
                  </details>
                );
              })}
          </PageSection>
        ))
      )}

      {/* Surcharges */}
      <PageSection title="Additional fees" bodyClassName="space-y-5">
          {surcharges.map((surcharge) => (
            <div key={surcharge.id} className="space-y-2">
              <SurchargeRow surcharge={surcharge} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">
                  Shows as{" "}
                  {surcharge.maxCents != null && surcharge.minCents != null
                    ? `${formatCents(surcharge.minCents)}–${formatCents(surcharge.maxCents)}`
                    : formatCents(surcharge.minCents ?? surcharge.maxCents)}
                </span>
                <form action={deleteSurcharge}>
                  <input type="hidden" name="id" value={surcharge.id} />
                  <button type="submit" className="text-xs text-stone-400 hover:text-red-600 underline">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
          <div className="border-t border-stone-100 pt-4">
            <SurchargeRow />
          </div>
      </PageSection>
    </PageShell>
  );
}
