import { getConfig } from "@/lib/config";
import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = await getConfig();
  const base = siteUrl(config);
  // Everything on these pages is edited in the admin panel, so the config's own
  // timestamp is the closest honest answer to "when did this last change".
  return base ? PUBLIC_PATHS.map((path) => ({ url: new URL(path, base).href, lastModified: config.updatedAt })) : [];
}
