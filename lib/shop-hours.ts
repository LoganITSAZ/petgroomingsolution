import { SHOP_TIMEZONE, currentShopTime } from "@/lib/utils";

/**
 * What the front of the site says about today.
 *
 * The hero opens on the shop's actual state rather than a slogan — a stranger
 * deciding where to take a nervous dog wants to know whether anyone is there
 * right now. Everything here is wall clock in the shop's zone: the server runs
 * in UTC and the visitor's browser is in their own timezone, so neither one
 * can be asked what day it is.
 */

export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Record<string, DayHours>;

export const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

/** "8:00" → "8am", "15:30" → "3:30pm". */
export function clock(value: string): string {
  const [hourRaw, minute] = value.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute && minute !== "00" ? `${twelve}:${minute}${suffix}` : `${twelve}${suffix}`;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/** Index into DAY_KEYS for the shop's own day, not the server's. */
export function shopDayIndex(now: Date = new Date(), timeZone = SHOP_TIMEZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
    .format(now)
    .toLowerCase();
  const index = DAY_KEYS.indexOf(name as (typeof DAY_KEYS)[number]);
  return index === -1 ? 0 : index;
}

export interface ShopState {
  open: boolean;
  /** "Open till 5pm" / "Closed · opens Tue 8am" — already reader-facing. */
  label: string;
}

/**
 * Open or closed right now, and the next thing that happens.
 *
 * A shop with no hours set at all gets no claim either way: saying "Closed"
 * because nobody filled the form in would turn customers away.
 */
export function shopState(hours: BusinessHours, now: Date = new Date()): ShopState | null {
  if (!hours || DAY_KEYS.every((key) => !hours[key])) return null;

  const today = shopDayIndex(now);
  const nowMins = minutes(currentShopTime(now));
  const todayHours = hours[DAY_KEYS[today]] ?? null;

  if (todayHours && nowMins >= minutes(todayHours.open) && nowMins < minutes(todayHours.close)) {
    return { open: true, label: `Open till ${clock(todayHours.close)}` };
  }

  // The next opening, today included if the shop has not opened yet.
  for (let ahead = 0; ahead < 7; ahead++) {
    const index = (today + ahead) % 7;
    const day = hours[DAY_KEYS[index]];
    if (!day) continue;
    if (ahead === 0 && nowMins >= minutes(day.open)) continue;
    const when =
      ahead === 0 ? `${clock(day.open)}` : `${DAY_LABELS[DAY_KEYS[index]]} ${clock(day.open)}`;
    return { open: false, label: `Closed · opens ${when}` };
  }

  return { open: false, label: "Closed" };
}

/**
 * Today's published hours, whatever the clock says — "Today 8am – 5pm", or
 * "Closed today". The header already carries the live open/shut state, so this
 * answers the other half of the question rather than repeating it.
 */
export function todayLabel(hours: BusinessHours, now: Date = new Date()): string {
  const day = hours?.[DAY_KEYS[shopDayIndex(now)]] ?? null;
  return day ? `Today ${clock(day.open)} – ${clock(day.close)}` : "Closed today";
}

/** Consecutive days with identical hours collapse into one line. */
export function summariseHours(hours: BusinessHours): string[] {
  const rows: { label: string; text: string }[] = [];
  // Monday first: a week of opening hours is read starting at the working week.
  const week = [...DAY_KEYS.slice(1), DAY_KEYS[0]];

  for (const key of week) {
    const day = hours?.[key] ?? null;
    const text = day ? `${clock(day.open)} – ${clock(day.close)}` : "Closed";
    const last = rows[rows.length - 1];
    if (last && last.text === text) {
      last.label = `${last.label.split("–")[0].trim()} – ${DAY_LABELS[key]}`;
    } else {
      rows.push({ label: DAY_LABELS[key], text });
    }
  }

  return rows.map((row) => `${row.label}: ${row.text}`);
}
