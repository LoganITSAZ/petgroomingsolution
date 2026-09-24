import * as React from "react";
import { prisma } from "@/lib/prisma";
import type { SystemConfig } from "@prisma/client";
import { DEFAULT_SHOP_NAME, DEFAULT_SHOP_TAGLINE } from "@/lib/branding";

/**
 * Fetch the global system config row.
 * Creates the default row if it doesn't exist yet (first boot).
 */
/*
 * Per-request dedupe. Nearly every server component asks for this row, and
 * React's cache() collapses them into one query.
 *
 * It is read off the namespace rather than imported by name because cache()
 * only exists in React's server build: Vitest resolves the client one, and a
 * missing named import would take every test that touches a module importing
 * this file down with it.
 */
const perRequest = (React as { cache?: <T>(fn: T) => T }).cache ?? (<T,>(fn: T) => fn);

export const getConfig = perRequest(async (): Promise<SystemConfig> => {
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
      businessHours: DEFAULT_BUSINESS_HOURS,
      bookingLeadHours: 2,
      bookingWindowDays: 30,
      walkInWindowStart: "09:00",
      walkInWindowEnd: "15:00",
    },
  });
});

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
