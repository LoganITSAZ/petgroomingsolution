import { prisma } from "@/lib/prisma";
import type { Promotion, Service } from "@prisma/client";
import { promotionState } from "@/lib/promotions";
import { formatShopDate, formatShopTime } from "@/lib/utils";
import { deleteFaqItem, deletePromotion, saveFaqItem, savePageSeo, savePromotion, saveSearchSettings } from "./actions";
import { PAGE_LABELS, PUBLIC_PATHS, publicMetadata, serviceAreaName, siteUrl, type PublicPath } from "@/lib/seo";
import { getConfig } from "@/lib/config";
import { photoUrl } from "@/lib/photos";
import { geocode } from "@/lib/maps";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";
import ModalButton from "@/components/ModalButton";
import DateRangeLiveWarning from "@/components/admin/DateRangeLiveWarning";

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
  question_required: "A question needs asking.",
  answer_required: "A question needs an answer.",
  unknown_page: "That is not a public page.",
  too_large: "That image is over 2 MB.",
  bad_type: "Share images must be JPEG, PNG or WebP.",
  backwards_window: "The end date has to come after the start date.",
};

const STATE_BADGE: Record<string, string> = {
  live: "bg-green-100 text-green-700",
  scheduled: "bg-sky-100 text-sky-700",
  ended: "bg-stone-100 text-stone-400",
  off: "bg-stone-100 text-stone-400",
};

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

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
        <DateRangeLiveWarning
          startName="startsAt"
          endName="endsAt"
          message="The end date has to come after the start date."
        >
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
        </DateRangeLiveWarning>
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
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}

export default async function AdminMarketingPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const [promotions, services] = await Promise.all([
    prisma.promotion.findMany({
      include: { service: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const [config, seoPages, faq] = await Promise.all([
    getConfig(),
    prisma.seoPage.findMany(),
    prisma.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const overrides = new Map(seoPages.map((page) => [page.path, page]));
  const base = siteUrl(config);
  // Same lookup the public pages read, so the preview cannot disagree with them.
  const geo = await geocode(config.shopAddress);
  const place = serviceAreaName(config, geo);

  const now = new Date();
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;
  const liveCount = promotions.filter((p) => promotionState(p, now) === "live").length;

  return (
    <PageShell
      title="Marketing"
      subtitle={
        <>
          {liveCount} promotion{liveCount !== 1 ? "s" : ""} running now. Live copy appears on the
          public site and on the staff dashboard.
        </>
      }
      actions={
        <ModalButton
          label="New promotion"
          title="New promotion"
          description="An offer is tied to one service and runs between two dates."
        >
          <form action={savePromotion} className="space-y-4">
            <PromotionFields services={services} />
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Publish
              </button>
            </div>
          </form>
        </ModalButton>
      }
    >

      {searchParams.saved && (
        <SaveToast>
          Saved {searchParams.saved}.
        </SaveToast>
      )}
      {searchParams.deleted === "1" && (
        <SaveToast>
          Promotion removed.
        </SaveToast>
      )}
      {errorMessage && (
        <SaveToast tone="error">
          {errorMessage}
        </SaveToast>
      )}

      {services.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Add a service first — a promotion has to point at something the shop sells.
        </PageSection>
      ) : promotions.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No promotions yet. Anything published here shows beside its service on the site and at
          the counter.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
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
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATE_BADGE[state]}`}
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
                        className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
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
        </PageSection>
      )}

      <PageSection title="Search & sharing">
        <form id="search" action={saveSearchSettings} className="space-y-3">
          <p className="text-xs text-muted">
            {base ? (
              <>
                Live at <span className="font-mono">{base.host}</span>
                {place ? <> · search engines are told the shop is in <strong>{place}</strong></> : null}. Titles, opening hours, the
                service list and prices are all read from the shop&apos;s own records, so nothing here needs re-typing when they change.
              </>
            ) : (
              <>
                Nothing is published yet: set <Link href="/admin/settings#shop-details" className="underline">Live website URL</Link> in
                Shop Settings and these pages leave the noindex state.
              </>
            )}
            {base && !place && (
              <>
                {" "}
                No city could be read from the shop address —{" "}
                <Link href="/admin/settings#shop-details" className="underline">correct it in Shop Settings</Link>.
              </>
            )}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Service area (miles)</span>
              <input name="serviceAreaMiles" inputMode="numeric" defaultValue={config.serviceAreaMiles} className={inputClass} />
              <span className="mt-1 block text-xs text-stone-400">How far out the public copy says the shop serves.</span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Social card tagline</span>
              <input name="seoSocialTagline" defaultValue={config.seoSocialTagline ?? ""} placeholder={config.shopTagline ?? "Patience, love and kindness"} className={inputClass} />
              <span className="mt-1 block text-xs text-stone-400">
                Under the shop name on the shared link image. Blank uses the site tagline.
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Google Search Console token</span>
              <input name="seoGoogleVerification" defaultValue={config.seoGoogleVerification ?? ""} className={`${inputClass} font-mono`} />
              <span className="mt-1 block text-xs text-stone-400">
                The `content` value from Search Console&apos;s HTML tag method. Only needed if the domain cannot be verified by DNS.
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Keywords</span>
              <input name="seoKeywords" defaultValue={config.seoKeywords ?? ""} placeholder="dog grooming, cat grooming, nail trim" className={inputClass} />
              <span className="mt-1 block text-xs text-stone-400">
                Comma separated. No major search engine ranks on this tag — it is here because it was asked for.
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 rounded-lg px-5 py-2 text-sm font-semibold">
              Save
            </button>
          </div>
        </form>
      </PageSection>

      <PageSection
        title="Page titles & descriptions"
        hint="Blank means the line written from the shop's own details"
        padded={false}
        bodyClassName="divide-y divide-stone-100"
      >
        {PUBLIC_PATHS.map((path) => {
          const override = overrides.get(path);
          // The derived copy, with no override applied — what the shop gets by
          // doing nothing, shown as the placeholder so it is never a guess.
          const derived = publicMetadata(config, path as PublicPath, null, geo);
          const image = photoUrl(override?.photoId);
          const custom = [override?.title, override?.description, override?.keywords, override?.photoId].filter(Boolean).length;
          return (
            <details key={path}>
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="font-semibold text-stone-900">{PAGE_LABELS[path]}</span>
                  <span className="ml-2 font-mono text-xs text-stone-400">{path}</span>
                  <span className="block truncate text-xs text-stone-400">{String(override?.title || derived.title)}</span>
                </span>
                <span className="whitespace-nowrap rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-400">
                  {custom ? `${custom} custom` : "derived"}
                </span>
              </summary>
              <form action={savePageSeo} className="space-y-3 border-t border-stone-100 px-5 pb-5 pt-4">
                <input type="hidden" name="path" value={path} />
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-500">Title</span>
                  <input name="title" defaultValue={override?.title ?? ""} placeholder={String(derived.title ?? "")} className={inputClass} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-500">Description</span>
                  <textarea name="description" rows={3} defaultValue={override?.description ?? ""} placeholder={derived.description ?? ""} className={`${inputClass} resize-y`} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-500">Keywords</span>
                  <input name="keywords" defaultValue={override?.keywords ?? ""} placeholder={config.seoKeywords ?? "Uses the shop keywords"} className={inputClass} />
                </label>
                <div className="text-sm">
                  <span className="mb-1 block text-stone-500">Share image</span>
                  {image ? (
                    <div className="mb-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" className="h-16 w-28 rounded-lg border border-stone-200 object-cover" />
                      <label className="flex items-center gap-2 text-xs text-stone-500">
                        <input type="checkbox" name="removeImage" className="accent-amber-700" />
                        Use the generated card instead
                      </label>
                    </div>
                  ) : (
                    <p className="mb-2 text-xs text-stone-400">
                      Using the generated card: the shop name, tagline and live theme, at 1200×630.
                    </p>
                  )}
                  <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="text-xs" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 rounded-lg px-5 py-2 text-sm font-semibold">
                    Save
                  </button>
                </div>
              </form>
            </details>
          );
        })}
      </PageSection>

      <PageSection
        title="Frequently asked questions"
        hint={`${faq.filter((item) => item.isActive).length} shown on the services page`}
      >
        <div id="faq" className="space-y-3">
          {faq.length === 0 && (
            <p className="text-sm text-stone-400">
              Nothing yet. Questions added here appear on the services page and are published as FAQ markup.
            </p>
          )}
          {faq.map((item) => (
            <details key={item.id} className="rounded-lg border border-well-line bg-well">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate font-medium text-stone-900">{item.question}</span>
                {!item.isActive && (
                  <span className="whitespace-nowrap rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-400">hidden</span>
                )}
              </summary>
              <div className="space-y-3 border-t border-well-line px-3 pb-3 pt-3">
                <form action={saveFaqItem} className="space-y-3">
                  <input type="hidden" name="id" value={item.id} />
                  <FaqFields item={item} />
                  <div className="flex justify-end">
                    <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 rounded-lg px-4 py-1.5 text-sm font-semibold">
                      Save
                    </button>
                  </div>
                </form>
                <form action={deleteFaqItem} className="flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-xs text-stone-400 underline hover:text-red-600">
                    Delete this question
                  </button>
                </form>
              </div>
            </details>
          ))}
          <form action={saveFaqItem} className="space-y-3 rounded-lg border border-dashed border-well-line px-3 py-3">
            <FaqFields />
            <div className="flex justify-end">
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 rounded-lg px-4 py-1.5 text-sm font-semibold">
                Add question
              </button>
            </div>
          </form>
        </div>
      </PageSection>
    </PageShell>
  );
}

function FaqFields({ item }: { item?: { question: string; answer: string; sortOrder: number; isActive: boolean } }) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-500">Question</span>
        <input name="question" required defaultValue={item?.question ?? ""} placeholder="Do you groom cats?" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-stone-500">Answer</span>
        <textarea name="answer" rows={3} required defaultValue={item?.answer ?? ""} className={`${inputClass} resize-y`} />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">Order</span>
          <input name="sortOrder" inputMode="numeric" defaultValue={item?.sortOrder ?? 0} className={`${inputClass} w-24`} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-stone-700">
          <input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} className="accent-amber-700" />
          Show on the site
        </label>
      </div>
    </div>
  );
}
