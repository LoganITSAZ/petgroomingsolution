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
          {" · tap one to read it"}
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
        groups.map((group) => (
          <PageSection
            key={group.heading}
            title={group.heading}
            padded={false}
            bodyClassName="divide-y divide-stone-100 border-t border-stone-100 mt-2"
          >
              {group.items.map((service) => {
                const offers = promotions.get(service.id) ?? [];
                const booked = bookedByService.get(service.id) ?? 0;

                return (
                  <details key={service.id} className="group">
                    <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-3 hover:bg-well transition-colors">
                      <span className="min-w-0">
                        <span className="font-semibold text-stone-900">{service.name}</span>
                        {service.walkInEligible && (
                          <span className="ml-2 text-[10px] font-bold text-emerald-700 ">
                            Walk-in
                          </span>
                        )}
                        {offers.length > 0 && (
                          <span className="ml-2 text-[10px] font-bold text-amber-700 ">
                            Promo
                          </span>
                        )}
                        <span className="block text-xs text-stone-400">
                          {SERVICE_CATEGORY_LABEL[service.category]}
                          {service.durationMins ? ` · ${service.durationMins} min` : ""}
                          {booked > 0 ? ` · booked ${booked}× in 90 days` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-medium text-stone-700 whitespace-nowrap">
                        {servicePriceLabel(service)}
                        <span className="ml-2 text-stone-400 group-open:hidden">▾</span>
                        <span className="ml-2 text-stone-400 hidden group-open:inline">▴</span>
                      </span>
                    </summary>

                    <div className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-2">
                      {service.description && (
                        <p className="text-sm text-stone-600">{service.description}</p>
                      )}

                      {service.staffNotes && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-bold text-amber-800 tracking-tight">
                            Staff notes
                          </p>
                          <p className="text-sm text-stone-700 whitespace-pre-wrap">
                            {service.staffNotes}
                          </p>
                        </div>
                      )}

                      {/* What to quote */}
                      {isSizePriced(service) ? (
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          {[
                            { label: "Small", cents: service.priceSmallCents },
                            { label: "Medium", cents: service.priceMediumCents },
                            { label: "Large", cents: service.priceLargeCents },
                            { label: "XL", cents: service.priceXlCents },
                          ].map((tier) => (
                            <div
                              key={tier.label}
                              className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5"
                            >
                              <p className="text-[10px] text-stone-500 ">{tier.label}</p>
                              <p className="font-bold text-stone-900">{formatCents(tier.cents)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-stone-600">
                          <span className="font-semibold text-stone-900">
                            {servicePriceLabel(service)}
                          </span>{" "}
                          whatever the size.
                        </p>
                      )}

                      {offers.map((promotion) => (
                        <div
                          key={promotion.id}
                          className="bg-amber-100 border border-amber-200 rounded-lg px-3 py-2"
                        >
                          <p className="text-sm font-bold text-stone-900">
                            {promotion.title}
                            {promotion.code && (
                              <span className="ml-2 font-mono text-xs bg-white border border-amber-300 text-amber-800 px-1.5 py-0.5 rounded">
                                {promotion.code}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-stone-700 whitespace-pre-wrap">
                            {promotion.body}
                          </p>
                        </div>
                      ))}

                      <p className="text-xs text-stone-400">
                        {service.walkInEligible
                          ? "Can be taken as a walk-in."
                          : "Appointment only."}
                        {service.durationMins
                          ? ` Allow about ${service.durationMins} minutes.`
                          : ""}
                      </p>
                    </div>
                  </details>
                );
              })}
          </PageSection>
        ))
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
