import { prisma } from "@/lib/prisma";
import { Species } from "@prisma/client";
import { SERVICE_CATEGORY_LABEL, formatCents, isSizePriced, servicePriceLabel } from "@/lib/pricing";
import { livePromotionsByService } from "@/lib/promotions";
import { auth } from "@/lib/auth";
import { currentStaffIsAdmin } from "@/lib/staff-roles";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Services" };

/**
 * Counter reference: what the shop sells, what it costs, and what is being
 * promoted right now. Read-only — prices and promos are edited in the admin
 * panel so there is a single source for the public site and the till.
 */

export default async function StaffServicesPage() {
  const session = await auth();
  const isAdmin = session?.user ? await currentStaffIsAdmin() : false;

  const [services, surcharges, promotions, bookedCounts] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.surcharge.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    livePromotionsByService("staff"),
    // How often each one actually sells, for the last 90 days.
    prisma.appointmentService.groupBy({
      by: ["serviceId"],
      _count: { _all: true },
      where: {
        appointment: {
          scheduledAt: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
        },
      },
    }),
  ]);

  const bookedByService = new Map(
    bookedCounts
      .filter((row) => row.serviceId)
      .map((row) => [row.serviceId as string, row._count._all])
  );

  const groups = [
    { heading: "Dogs", items: services.filter((s) => s.species === Species.DOG) },
    { heading: "Cats", items: services.filter((s) => s.species === Species.CAT) },
    { heading: "Any pet", items: services.filter((s) => s.species === null) },
    { heading: "Other", items: services.filter((s) => s.species === Species.OTHER) },
  ].filter((group) => group.items.length > 0);

  const walkIns = services.filter((s) => s.walkInEligible);
  const promoCount = Array.from(promotions.values()).reduce((n, list) => n + list.length, 0);

  return (
    <PageShell
      title="Services"
      subtitle={
        <>
          {services.length} service{services.length !== 1 ? "s" : ""} offered ·{" "}
          {walkIns.length} available as walk-ins
          {promoCount > 0 && ` · ${promoCount} running promotion${promoCount !== 1 ? "s" : ""}`}
        </>
      }
      actions={
        isAdmin ? (
          <Link
            href="/admin/services"
            className="text-sm text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Edit pricing →
          </Link>
        ) : null
      }
    >
      {services.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No services are listed yet.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false}>
          <table className="w-full text-sm">
            {/* The column names are the same for every species, so they are
                written once at the top and each group is a labelled tbody. */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-well border-b border-stone-200 text-left">
                {["Service", "Category", "Time", "Small", "Medium", "Large", "XL", "Walk-in", "90 days"].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 py-2 text-xs font-semibold text-stone-500 tracking-tight whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.heading} className="divide-y divide-stone-100">
                <tr className="service-group-heading" data-pet-group={group.heading}>
                  <th
                    scope="colgroup"
                    colSpan={9}
                    className="border-y px-3 py-2 text-left font-display text-[0.75rem] font-bold uppercase tracking-[0.09em]"
                  >
                    {group.heading}
                  </th>
                </tr>
                  {group.items.map((service) => {
                    const offers = promotions.get(service.id) ?? [];
                    const booked = bookedByService.get(service.id) ?? 0;

                    return (
                      <tr key={service.id} className="align-top hover:bg-well transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-stone-900">{service.name}</span>
                          {service.description && (
                            <span className="block text-xs text-stone-500">{service.description}</span>
                          )}
                          {service.staffNotes && (
                            <span className="mt-1 block rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-stone-700 whitespace-pre-wrap">
                              <span className="font-bold text-amber-800">Staff notes: </span>
                              {service.staffNotes}
                            </span>
                          )}
                          {offers.map((promotion) => (
                            <span
                              key={promotion.id}
                              className="mt-1 block rounded-lg border border-amber-200 bg-amber-100 px-2 py-1 text-xs text-stone-700"
                            >
                              <span className="font-bold text-stone-900">{promotion.title}</span>
                              {promotion.code && (
                                <span className="ml-2 rounded border border-amber-300 bg-white px-1 py-0.5 font-mono text-[10px] text-amber-800">
                                  {promotion.code}
                                </span>
                              )}
                              <span className="block whitespace-pre-wrap">{promotion.body}</span>
                            </span>
                          ))}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600 whitespace-nowrap">
                          {SERVICE_CATEGORY_LABEL[service.category]}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600 whitespace-nowrap">
                          {service.durationMins ? `${service.durationMins} min` : "\u2014"}
                        </td>
                        {isSizePriced(service) ? (
                          [
                            service.priceSmallCents,
                            service.priceMediumCents,
                            service.priceLargeCents,
                            service.priceXlCents,
                          ].map((cents, i) => (
                            <td key={i} className="px-3 py-2.5 font-medium text-stone-900 whitespace-nowrap">
                              {formatCents(cents)}
                            </td>
                          ))
                        ) : (
                          <td colSpan={4} className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-medium text-stone-900">{servicePriceLabel(service)}</span>
                            <span className="text-stone-400"> any size</span>
                          </td>
                        )}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {service.walkInEligible ? (
                            <span className="font-bold text-emerald-700">Yes</span>
                          ) : (
                            <span className="text-stone-400">Appointment</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600 whitespace-nowrap">
                          {booked > 0 ? `${booked}\u00d7` : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </PageSection>
      )}

      {surcharges.length > 0 && (
        <PageSection
          title="Additional fees"
          padded={false}
          bodyClassName="divide-y divide-stone-100 border-t border-stone-100 mt-2"
        >
            {surcharges.map((surcharge) => (
              <div key={surcharge.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-stone-700">
                  {surcharge.label}
                  {surcharge.note && (
                    <span className="block text-xs text-stone-400">{surcharge.note}</span>
                  )}
                </span>
                <span className="font-semibold text-stone-900 whitespace-nowrap">
                  {surcharge.minCents != null && surcharge.maxCents != null
                    ? `${formatCents(surcharge.minCents)}–${formatCents(surcharge.maxCents)}`
                    : formatCents(surcharge.minCents ?? surcharge.maxCents)}
                </span>
              </div>
            ))}
        </PageSection>
      )}
    </PageShell>
  );
}
