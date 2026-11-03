import { getConfig } from "@/lib/config";
import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@/lib/seo";
import { activeFaq } from "@/lib/seo-pages";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = await getConfig();
  const base = siteUrl(config);
  // Everything on these pages is edited in the admin panel, so the config's own
  // timestamp is the closest honest answer to "when did this last change".
  if (!base) return [];
  // No questions means no /faq page, so it is not listed.
  const hasFaq = (await activeFaq()).length > 0;
  return PUBLIC_PATHS.filter((path) => path !== "/faq" || hasFaq).map((path) => ({ url: new URL(path, base).href, lastModified: config.updatedAt }));
}
