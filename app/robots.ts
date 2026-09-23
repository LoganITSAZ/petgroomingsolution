import { getConfig } from "@/lib/config";
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl(await getConfig());
  if (!base) return { rules: { userAgent: "*", disallow: "/" } };
  // Auth pages must remain crawlable so crawlers can read their noindex tags.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: new URL("/sitemap.xml", base).href,
  };
}
