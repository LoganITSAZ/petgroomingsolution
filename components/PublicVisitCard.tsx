import { shopState, type BusinessHours } from "@/lib/shop-hours";
import type { getConfig } from "@/lib/config";
import PublicWeeklyHours from "@/components/PublicWeeklyHours";
import PublicShopStatus from "@/components/PublicShopStatus";
import OfficeIcon from "@/components/OfficeIcon";
import VisitCardPanels from "@/components/VisitCardPanels";
import type { ReactNode } from "react";

// "Plan your visit": today's state, the full week, and how to reach the shop.
// The home page and /contact both render this one card so the two cannot drift.
// `contact` replaces the phone line, so /contact can carry its call and message
// buttons inside the card rather than above it.
export default function PublicVisitCard({ config, contact }: { config: Awaited<ReturnType<typeof getConfig>>; contact?: ReactNode }) {
  const state = shopState((config.businessHours as BusinessHours) ?? {});

  return (
    <div className="glass-panel glass-feature public-visit-card overflow-hidden rounded-3xl">
      <div className="public-visit-heading">
        <span className="public-visit-icon"><OfficeIcon name="paw" /></span>
        <div>
          <p className="public-eyebrow">We look forward to meeting you</p>
          <h2 className="public-visit-title text-ink">Plan your visit</h2>
        </div>
      </div>

      <VisitCardPanels
        hours={
          <div className="p-6 md:p-7">
            <h3 className="mb-4 text-lg font-semibold text-ink">Weekly opening hours</h3>
            {state ? (
              <PublicWeeklyHours config={config} />
            ) : (
              <p className="text-sm text-muted">Please contact the shop for opening hours.</p>
            )}
          </div>
        }
      >
      <div className="p-6 md:p-7">
        <PublicShopStatus config={config} />

      </div>

      {(contact || config.shopPhone || config.shopAddress) && (
        <div className="space-y-5 border-t border-line/70 p-6 md:p-7">
          {config.shopAddress && (
            <div>
              <p className="text-sm text-muted">Find us</p>
              <p className="mt-1 break-words font-medium leading-relaxed text-ink">{config.shopAddress}</p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(config.shopAddress)}`}
                className="public-text-link"
              >
                Get directions <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
          {contact ?? (config.shopPhone && (
            <div>
              <p className="text-sm text-muted">Questions before your visit?</p>
              <a
                href={`tel:${config.shopPhone.replace(/[^\d+]/g, "")}`}
                className="mt-1 inline-flex min-h-11 items-center break-all text-lg font-semibold text-brand-text hover:underline"
              >
                {config.shopPhone}
              </a>
            </div>
          ))}
        </div>
      )}
      </VisitCardPanels>
    </div>
  );
}
