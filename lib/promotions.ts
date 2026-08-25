import { prisma } from "@/lib/prisma";
import type { Promotion, Service } from "@prisma/client";

export type PromotionWithService = Promotion & { service: Service };

/**
 * Promotions are date-windowed: a promo is live when it is active and now
 * falls inside [startsAt, endsAt). Either bound may be open.
 */
export function isLive(promotion: Promotion, now: Date = new Date()): boolean {
  if (!promotion.isActive) return false;
  if (promotion.startsAt && promotion.startsAt > now) return false;
  if (promotion.endsAt && promotion.endsAt <= now) return false;
  return true;
}

/** Live promotions for one audience, in display order. */
export async function livePromotions(
  audience: "site" | "staff",
  now: Date = new Date()
): Promise<PromotionWithService[]> {
  const promotions = await prisma.promotion.findMany({
    include: { service: true },
    where: {
      isActive: true,
      ...(audience === "site" ? { showOnSite: true } : { showToStaff: true }),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return promotions;
}

/** Where a promotion sits relative to now, for the admin list. */
export function promotionState(
  promotion: Promotion,
  now: Date = new Date()
): "live" | "scheduled" | "ended" | "off" {
  if (!promotion.isActive) return "off";
  if (promotion.startsAt && promotion.startsAt > now) return "scheduled";
  if (promotion.endsAt && promotion.endsAt <= now) return "ended";
  return "live";
}

/**
 * Live promotions keyed by the service they promote, so a catalog row can be
 * rendered with its offer attached wherever the service appears.
 */
export async function livePromotionsByService(
  audience: "site" | "staff",
  now: Date = new Date()
): Promise<Map<string, PromotionWithService[]>> {
  const promotions = await livePromotions(audience, now);
  const byService = new Map<string, PromotionWithService[]>();
  for (const promotion of promotions) {
    const list = byService.get(promotion.serviceId) ?? [];
    list.push(promotion);
    byService.set(promotion.serviceId, list);
  }
  return byService;
}
