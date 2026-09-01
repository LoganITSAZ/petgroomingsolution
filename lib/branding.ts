export const DEFAULT_SHOP_NAME = process.env.SHOP_NAME?.trim() || "Your Grooming Shop";
export const DEFAULT_SHOP_TAGLINE =
  process.env.SHOP_TAGLINE?.trim() || "The best and bubbliest groomer in town";
export const DEFAULT_SHOP_PHONE = process.env.SHOP_PHONE?.trim() || null;
export const DEFAULT_SHOP_EMAIL = process.env.SHOP_EMAIL?.trim() || null;
export const DEFAULT_SHOP_ADDRESS = process.env.SHOP_ADDRESS?.trim() || null;
export const DEFAULT_SHOP_WEBSITE = process.env.SHOP_WEBSITE?.trim() || null;
export const DEFAULT_EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS?.trim() || null;

/**
 * The first-boot admin login, when ADMIN_EMAIL is not set.
 *
 * Takes the shop's own domain when there is one — example.com is somebody
 * else's domain and a real shop should never be handed an address on it.
 * Falls back to a .local address, which cannot be routed anywhere.
 */
export const SHOP_MAIL_DOMAIN =
  DEFAULT_SHOP_EMAIL?.split("@")[1]?.trim() ||
  DEFAULT_SHOP_WEBSITE?.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "").trim() ||
  "gentlegroomer.local";

export const DEFAULT_ADMIN_EMAIL = `admin@${SHOP_MAIL_DOMAIN}`;

export function defaultWaiverText(shopName = DEFAULT_SHOP_NAME): string {
  return `
GENERAL LIABILITY WAIVER — ${shopName.toUpperCase()}

By signing this waiver, I acknowledge and agree to the following:

1. I am the legal owner or authorized agent for the pet(s) listed in my account.
2. I confirm that my pet is current on all required vaccinations.
3. I understand that grooming involves inherent risks, including stress to the animal.
4. I release ${shopName} and its staff from any liability for injury, illness, escape,
   or death of my pet that may occur during grooming, except in cases of gross negligence.
5. I authorize ${shopName} staff to seek emergency veterinary care for my pet if
   deemed necessary, and I agree to be responsible for any costs incurred.
6. I understand that aggressive or difficult animals may require additional handling fees.

This waiver applies to all future visits until a new version is issued.
`.trim();
}
