import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { embedUrl, geocode } from "@/lib/maps";

/**
 * Where the shop is, for screens that cannot render a server component.
 *
 * Deliberately public, like the kiosk that reads it: it returns only the shop
 * address already printed on the website, takes no input, and so cannot be
 * used to geocode anything else.
 */
export async function GET() {
  const config = await getConfig();
  const point = config.shopAddress ? await geocode(config.shopAddress) : null;

  return NextResponse.json({
    shopName: config.shopName,
    address: config.shopAddress,
    embedUrl: point ? embedUrl(point, 0.003) : null,
  });
}
