"use client";

import MultiPicker from "@/components/MultiPicker";

/**
 * Service selector for the booking forms — the shared jQuery picker with
 * prices and durations turned on.
 */

export interface ServiceOption {
  id: string;
  name: string;
  /** optgroup label, e.g. "Dogs" */
  group: string;
  /** Species this service is only for; null when it suits any pet. */
  speciesOnly: string | null;
  priceCents: number | null;
  durationMins: number | null;
}

export default function ServicePicker({
  services,
  initialServiceIds = [],
  name = "serviceIds",
}: {
  services: ServiceOption[];
  initialServiceIds?: string[];
  name?: string;
}) {
  return (
    <MultiPicker
      name={name}
      initialIds={initialServiceIds}
      options={services.map((service) => ({
        id: service.id,
        label: service.name,
        group: service.group,
        priceCents: service.priceCents,
        durationMins: service.durationMins,
      }))}
      addLabel="+ Add another service"
      placeholder="Select a service…"
      noun="service"
      showPrices
    />
  );
}
