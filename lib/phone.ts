/**
 * Turning what the shop typed into what a carrier will accept.
 *
 * `Customer.phone` is free text on purpose — the counter writes numbers the way
 * it says them, "(602) 555-0134", "602-555-0134 cell", "1 602 555 0134". Twilio
 * wants E.164. This is the one place that bridges the two.
 *
 * North America is assumed for a bare ten-digit number, because the shop has a
 * timezone and no country field. Anything already written with a `+` is taken at
 * its word, so an international number entered properly still works.
 */

/** A number the shop typed → E.164, or null if it cannot be one. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  // An explicit country code is the writer telling us they meant it.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    // E.164 allows 15 digits; a country code makes the floor 8 in practice.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  // "1 602 555 0134" — the country code written without its plus.
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** How a number reads back to a person, for a confirmation line. */
export function formatPhone(raw: string | null | undefined): string | null {
  const e164 = toE164(raw);
  if (!e164) return raw?.trim() || null;
  const digits = e164.slice(1);
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    return `(${area}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}
