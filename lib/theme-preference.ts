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
