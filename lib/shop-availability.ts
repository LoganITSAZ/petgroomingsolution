import { clock, shopState, todayLabel, type BusinessHours } from "@/lib/shop-hours";
import { isWithinWalkInWindow } from "@/lib/utils";

export interface AvailabilityConfig {
  businessHours: unknown;
  featureWalkInPortal: boolean;
  walkInWindowStart: string;
  walkInWindowEnd: string;
}

/** Public availability follows the shop's clock, never the visitor's timezone. */
export function shopAvailability(config: AvailabilityConfig, now = new Date()) {
  const hours = (config.businessHours as BusinessHours) ?? {};
  const shop = shopState(hours, now);
  const validWindow = /^([01]\d|2[0-3]):[0-5]\d$/;
  const hasWindow = validWindow.test(config.walkInWindowStart)
    && validWindow.test(config.walkInWindowEnd)
    && config.walkInWindowStart < config.walkInWindowEnd;
  const acceptingWalkIns = Boolean(shop?.open && config.featureWalkInPortal && hasWindow
    && isWithinWalkInWindow(config.walkInWindowStart, config.walkInWindowEnd, now));

  let walkInDetail = "Walk-ins are currently disabled.";
  if (config.featureWalkInPortal) {
    if (!shop || !hasWindow) {
      walkInDetail = "Please contact the shop to confirm walk-in availability.";
    } else if (!shop.open) {
      walkInDetail = "Walk-ins resume during shop opening hours and the walk-in window.";
    } else if (acceptingWalkIns) {
      // The shop may close before the configured walk-in window ends.
      walkInDetail = "Come on in during our walk-in hours.";
    } else {
      walkInDetail = "The shop is open, but the walk-in window is closed.";
    }
  }

  return {
    shop,
    today: shop ? todayLabel(hours, now) : "Contact us for opening hours.",
    acceptingWalkIns,
    walkInLabel: acceptingWalkIns ? "Accepting walk-ins now" : "Not accepting walk-ins right now",
    walkInDetail,
    walkInHours: config.featureWalkInPortal && hasWindow
      ? `${clock(config.walkInWindowStart)} – ${clock(config.walkInWindowEnd)} · on open days, during shop hours`
      : null,
  };
}

/** Group days only when both opening hours and actual walk-in hours match. */
export function weeklyAvailability(config: AvailabilityConfig) {
  const hours = (config.businessHours as BusinessHours) ?? {};
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  const rows: { days: string; firstDay: string; hours: string; walkIns: string }[] = [];
  days.forEach((key, index) => {
    const day = hours[key];
    const opening = day ? `${clock(day.open)} – ${clock(day.close)}` : "Closed";
    let walkIns = "Unavailable";
    if (day && config.featureWalkInPortal
      && [day.open, day.close, config.walkInWindowStart, config.walkInWindowEnd].every(time => validTime.test(time))) {
      const start = day.open > config.walkInWindowStart ? day.open : config.walkInWindowStart;
      const end = day.close < config.walkInWindowEnd ? day.close : config.walkInWindowEnd;
      if (start < end) walkIns = `${clock(start)} – ${clock(end)}`;
    }
    const previous = rows[rows.length - 1];
    if (previous && previous.hours === opening && previous.walkIns === walkIns) {
      previous.days = `${previous.firstDay} – ${labels[index]}`;
    } else {
      rows.push({ days: labels[index], firstDay: labels[index], hours: opening, walkIns });
    }
  });
  return rows;
}
