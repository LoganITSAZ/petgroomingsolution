import { prisma } from "@/lib/prisma";
import type { SystemConfig } from "@prisma/client";
import { DEFAULT_SHOP_NAME, DEFAULT_SHOP_TAGLINE, defaultWaiverText } from "@/lib/branding";

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
      shopName: DEFAULT_SHOP_NAME,
      shopTagline: DEFAULT_SHOP_TAGLINE,
      featureOnlineBooking: true,
      featureWalkInPortal: true,
      featureEmailNotify: true,
      featureSmsNotify: false,
      featureWaiverRequired: true,
      waiverVersion: "1.0",
      waiverText: defaultWaiverText(),
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
    | "featureRewards"
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

export const DEFAULT_WAIVER_TEXT = defaultWaiverText();
