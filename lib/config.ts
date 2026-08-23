import { prisma } from "@/lib/prisma";
import type { SystemConfig } from "@prisma/client";

/**
 * Fetch the global system config row.
 * Creates the default row if it doesn't exist yet (first boot).
 */
export async function getConfig(): Promise<SystemConfig> {
  return prisma.systemConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      shopName: "Gentle Groomer",
      featureOnlineBooking: true,
      featureWalkInPortal: true,
      featureEmailNotify: true,
      featureSmsNotify: false,
      featureWaiverRequired: true,
      waiverVersion: "1.0",
      waiverText: DEFAULT_WAIVER_TEXT,
      businessHours: DEFAULT_BUSINESS_HOURS,
      bookingLeadHours: 2,
      bookingWindowDays: 30,
      walkInWindowStart: "09:00",
      walkInWindowEnd: "15:00",
    },
  });
}

/**
 * Check whether a specific feature flag is enabled.
 * Accepts the key name of any boolean feature flag on SystemConfig.
 */
export async function isFeatureEnabled(
  feature: keyof Pick<
    SystemConfig,
    | "featureOnlineBooking"
    | "featureWalkInPortal"
    | "featureEmailNotify"
    | "featureSmsNotify"
    | "featureWaiverRequired"
  >
): Promise<boolean> {
  const config = await getConfig();
  return config[feature];
}

// ─── Defaults ──────────────────────────────────────────────

export const DEFAULT_BUSINESS_HOURS = {
  monday:    { open: "08:00", close: "15:00" },
  tuesday:   { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday:  { open: "08:00", close: "17:00" },
  friday:    { open: "08:00", close: "17:00" },
  saturday:  { open: "08:00", close: "17:00" },
  sunday:    null,
};

export const DEFAULT_WAIVER_TEXT = `
GENERAL LIABILITY WAIVER — GENTLE GROOMER

By signing this waiver, I acknowledge and agree to the following:

1. I am the legal owner or authorized agent for the pet(s) listed in my account.
2. I confirm that my pet is current on all required vaccinations.
3. I understand that grooming involves inherent risks, including stress to the animal.
4. I release Gentle Groomer and its staff from any liability for injury, illness, escape,
   or death of my pet that may occur during grooming, except in cases of gross negligence.
5. I authorize Gentle Groomer staff to seek emergency veterinary care for my pet if
   deemed necessary, and I agree to be responsible for any costs incurred.
6. I understand that aggressive or difficult animals may require additional handling fees.

This waiver applies to all future visits until a new version is issued.
`.trim();
