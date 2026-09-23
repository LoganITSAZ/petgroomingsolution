import { prisma } from "@/lib/prisma";
import { cache } from "react";
import type { PublicPath } from "@/lib/seo";

/**
 * The database half of lib/seo.ts, kept out of it so the arithmetic there
 * stays pure and testable. `cache()` matters: `generateMetadata()` and the
 * page body both ask for the same row on the same render.
 */

export const seoOverride = cache(async function seoOverride(path: PublicPath) {
  return prisma.seoPage.findUnique({ where: { path } });
});

export const activeFaq = cache(async function activeFaq() {
  return prisma.faqItem.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
});
