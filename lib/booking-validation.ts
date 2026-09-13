import { clock, DAY_KEYS, shopDayIndex, type BusinessHours } from "@/lib/shop-hours";
import { currentShopTime } from "@/lib/utils";

/**
 * The wall-clock rules a booking has to clear, with no database in them.
 *
 * This is deliberately pure: every rule here is a timezone comparison, which
 * is the easiest thing in this codebase to get subtly wrong, and the only way
 * to hold it still is to test it against a frozen clock. `lib/create-appointment.ts`
 * is the half that talks to Postgres.
 *
 * What is NOT here, on purpose: any per-groomer concurrency check. Pets sit in
 * kennels between the bath and the table, so one groomer's bookings are
 * *expected* to overlap in wall time. One pet at a time is enforced on the
 * floor by `stationCapacity()`, which returns 1 for a groom or bath station.
 */

export type BookingRefusalCode =
  | "PAST"
  | "CLOSED_DAY"
  | "OUTSIDE_HOURS"
  | "TOO_SOON"
  | "TOO_FAR";

export type BookingRefusal = { code: BookingRefusalCode; message: string };

/** Minutes since shop-local midnight for a moment. */
function shopMinutes(at: Date): number {
  const [h, m] = currentShopTime(at).split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight for an "HH:MM" string; NaN if unparseable. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/**
 * Refuse what is definitely wrong, and nothing else. Returns null to accept.
 *
 * `enforceWindow` is false for staff: they book a customer standing at the
 * counter for ten minutes' time, and they book months out for a regular. The
 * lead time and booking window are promises made to *customers* on the public
 * site, not rules about when the shop may write in its own diary.
 */
export function validateBookingTime(input: {
  scheduledAt: Date;
  hours: BusinessHours | null;
  leadHours: number;
  windowDays: number;
  enforceWindow: boolean;
  now?: Date;
}): BookingRefusal | null {
  const { scheduledAt, hours, leadHours, windowDays, enforceWindow } = input;
  const now = input.now ?? new Date();

  if (scheduledAt.getTime() < now.getTime()) {
    return { code: "PAST", message: "That time has already passed." };
  }

  if (enforceWindow) {
    const leadMs = leadHours * 60 * 60 * 1000;
    if (scheduledAt.getTime() - now.getTime() < leadMs) {
      return {
        code: "TOO_SOON",
        message:
          leadHours === 1
            ? "Please book at least 1 hour ahead, or call the shop."
            : `Please book at least ${leadHours} hours ahead, or call the shop.`,
      };
    }

    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    if (scheduledAt.getTime() - now.getTime() > windowMs) {
      return {
        code: "TOO_FAR",
        message: `Bookings open ${windowDays} days ahead.`,
      };
    }
  }

  // No published hours means the shop has not told us when it is shut, and
  // guessing would refuse real bookings. Let it through.
  if (!hours) return null;

  // The shop's own weekday, not the server's: in Phoenix a UTC evening is
  // still the afternoon before, and reading the wrong row here would refuse a
  // Saturday booking for being a Sunday.
  const day = hours[DAY_KEYS[shopDayIndex(scheduledAt)]];
  if (!day) {
    return { code: "CLOSED_DAY", message: "The shop is closed that day." };
  }

  const minute = shopMinutes(scheduledAt);
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;

  // Close is exclusive — a visit starting as the door is locked is not a visit.
  if (minute < open || minute >= close) {
    return {
      code: "OUTSIDE_HOURS",
      message: `That day the shop is open ${clock(day.open)}–${clock(day.close)}.`,
    };
  }

  return null;
}
