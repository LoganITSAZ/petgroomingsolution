import { shopAvailability, type AvailabilityConfig } from "@/lib/shop-availability";

export default function PublicShopStatus({ config }: { config: AvailabilityConfig }) {
  const status = shopAvailability(config);
  const message = !status.shop
    ? "Contact us to confirm opening hours and walk-in availability"
    : !status.shop.open
      ? "We're currently closed and not accepting walk-ins"
      : status.acceptingWalkIns
        ? "We're open and accepting walk-ins!"
        : "We're open, but not accepting walk-ins right now";
  return (
    <div className="public-shop-status" role="status" aria-live="polite" aria-atomic="true">
      <div className="public-shop-status-row">
        <span aria-hidden="true" className={`public-status-dot ${status.shop?.open ? "bg-signal-open" : "bg-signal-shut"}`} />
        <div>
          <p className="public-shop-status-title">{message}</p>
          {status.shop && <p className="public-shop-status-detail">{status.shop.label}</p>}
          {status.shop && <p className="public-shop-status-detail">{status.today}</p>}
          {status.walkInHours && <p className="public-shop-status-detail">Walk-in hours: {status.walkInHours}</p>}
        </div>
      </div>
    </div>
  );
}
