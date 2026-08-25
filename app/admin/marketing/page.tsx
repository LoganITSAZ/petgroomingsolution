import { prisma } from "@/lib/prisma";
import type { Promotion, Service } from "@prisma/client";
import { promotionState } from "@/lib/promotions";
import { formatShopDate, formatShopTime } from "@/lib/utils";
import { deletePromotion, savePromotion } from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Marketing" };

/**
 * Marketing copy shown to customers on the public site and to staff at the
 * counter. Same record, two audiences, so a promo is never advertised in one
 * place and unknown in the other.
 */

const NOTICES: Record<string, string> = {
  title_required: "A promotion needs a title.",
  body_required: "A promotion needs body copy.",
  invalid_dates: "Those dates could not be read.",
  service_required: "Pick the service this promotion applies to.",
  service_missing: "That service no longer exists.",
  backwards_window: "The end date has to come after the start date.",
};

const STATE_BADGE: Record<string, string> = {
  live: "bg-green-100 text-green-700",
  scheduled: "bg-sky-100 text-sky-700",
  ended: "bg-stone-100 text-stone-400",
  off: "bg-stone-100 text-stone-400",
};

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

/** datetime-local wants "YYYY-MM-DDTHH:mm". */
function toLocalInput(value: Date | null): string {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours()
  )}:${pad(value.getMinutes())}`;
}

function PromotionFields({
  promotion,
  services,
}: {
  promotion?: Promotion;
  services: Service[];
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Service</span>
        <select
          name="serviceId"
          required
          defaultValue={promotion?.serviceId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Select the service being promoted…
          </option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
              {service.isActive ? "" : " (retired)"}
            </option>
          ))}
        </select>
        <span className="block text-xs text-stone-400 mt-1">
          The offer shows next to this service on the pricing page, the counter list and the
          booking form.
        </span>
      </label>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Title</span>
        <input name="title" required defaultValue={promotion?.title ?? ""} className={inputClass} />
      </label>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Body</span>
        <textarea
          name="body"
          rows={3}
          required
          defaultValue={promotion?.body ?? ""}
          className={`${inputClass} resize-y`}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Promo code</span>
          <input name="code" defaultValue={promotion?.code ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Starts</span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={toLocalInput(promotion?.startsAt ?? null)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Ends</span>
          <input
            type="datetime-local"
            name="endsAt"
            defaultValue={toLocalInput(promotion?.endsAt ?? null)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Sort order</span>
          <input
            name="sortOrder"
            inputMode="numeric"
            defaultValue={promotion?.sortOrder ?? 0}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={promotion?.isActive ?? true}
            className="accent-amber-700"
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="showOnSite"
            defaultChecked={promotion?.showOnSite ?? true}
            className="accent-amber-700"
          />
          Show on the public site
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="showToStaff"
            defaultChecked={promotion?.showToStaff ?? true}
            className="accent-amber-700"
          />
          Show to staff at the counter
        </label>
      </div>
    </div>
  );
}

interface PageProps {
  searchParams: { saved?: string; deleted?: string; error?: string };
}

export default async function AdminMarketingPage({ searchParams }: PageProps) {
  const [promotions, services] = await Promise.all([
    prisma.promotion.findMany({
      include: { service: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const now = new Date();
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;
  const liveCount = promotions.filter((p) => promotionState(p, now) === "live").length;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Marketing</h1>
        <p className="text-sm text-stone-500 mt-1">
          {liveCount} promotion{liveCount !== 1 ? "s" : ""} running now. Live copy appears on the
          public site and on the staff dashboard.
        </p>
      </div>

      {searchParams.saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          Saved {searchParams.saved}.
        </div>
      )}
      {searchParams.deleted === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          Promotion removed.
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      <details className="bg-white border border-stone-200 rounded-xl">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-stone-800">
          + New promotion
        </summary>
        <form action={savePromotion} className="px-6 pb-6 space-y-4 border-t border-stone-100 pt-4">
          <PromotionFields services={services} />
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
            >
              Publish
            </button>
          </div>
        </form>
      </details>

      {services.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
          Add a service first — a promotion has to point at something the shop sells.
        </div>
      ) : promotions.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-4 text-center text-stone-400 text-sm">
          No promotions yet. Anything published here shows beside its service on the site and at
          the counter.
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {promotions.map((promotion) => {
            const state = promotionState(promotion, now);
            return (
              <details key={promotion.id}>
                <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-semibold text-stone-900">{promotion.title}</span>
                    <span className="ml-2 text-xs text-stone-500">on {promotion.service.name}</span>
                    {promotion.code && (
                      <span className="ml-2 text-xs font-mono text-amber-700">{promotion.code}</span>
                    )}
                    <span className="block text-xs text-stone-400">
                      {promotion.startsAt
                        ? `From ${formatShopDate(promotion.startsAt)} ${formatShopTime(promotion.startsAt)}`
                        : "No start date"}
                      {promotion.endsAt
                        ? ` · until ${formatShopDate(promotion.endsAt)} ${formatShopTime(promotion.endsAt)}`
                        : " · no end date"}
                      {" · "}
                      {[
                        promotion.showOnSite ? "site" : null,
                        promotion.showToStaff ? "counter" : null,
                      ]
                        .filter(Boolean)
                        .join(" + ") || "not shown anywhere"}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${STATE_BADGE[state]}`}
                  >
                    {state}
                  </span>
                </summary>
                <div className="px-5 pb-5 border-t border-stone-100 pt-4 space-y-4">
                  <form action={savePromotion} className="space-y-3">
                    <input type="hidden" name="id" value={promotion.id} />
                    <PromotionFields promotion={promotion} services={services} />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  <form action={deletePromotion} className="flex justify-end">
                    <input type="hidden" name="id" value={promotion.id} />
                    <button type="submit" className="text-xs text-stone-400 hover:text-red-600 underline">
                      Delete this promotion
                    </button>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
