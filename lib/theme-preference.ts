import { ThemePreference } from "@prisma/client";

/**
 * A posted theme, or the safe default.
 *
 * Form data is whatever the browser sent, and the column is an enum — an
 * unrecognised string would be a database error rather than a shrug. SYSTEM is
 * the fallback because it is the least opinionated answer: follow the device.
 */
export function readTheme(value: FormDataEntryValue | null): ThemePreference {
  // Object.hasOwn, not `in`: `in` walks the prototype, so "toString" and
  // "constructor" would both pass as themes.
  return typeof value === "string" && Object.hasOwn(ThemePreference, value)
    ? (value as ThemePreference)
    : ThemePreference.SYSTEM;
}

/**
 * The class a layout puts on its themed wrapper.
 *
 * SYSTEM carries a marker of its own even though no CSS reads it. The system
 * script adds `dark` behind React's back, and React only rewrites `class` when
 * the string it rendered changes — so if SYSTEM and LIGHT rendered the same
 * string, switching to Light would leave the script's `dark` in place until a
 * hard reload.
 */
export function themeClass(preference: ThemePreference | undefined): string {
  if (preference === ThemePreference.DARK) return "dark";
  if (preference === ThemePreference.SYSTEM) return "theme-system";
  return "";
}
