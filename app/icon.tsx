import { ImageResponse } from "next/og";
import { getConfig } from "@/lib/config";
import { resolveTheme } from "@/lib/themes";

export const dynamic = "force-dynamic";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * The tab icon, and the one Google prints beside a search result.
 *
 * Same rule as the title template: the shop's initial on the shop's own brand
 * colour, rather than a file somebody has to make in an image editor and
 * upload. There was no icon at all before, which is a blank square in every
 * tab and every bookmark.
 */
export default async function Icon() {
  const config = await getConfig();
  const { tokens } = resolveTheme(config, { month: 1, day: 1 });
  const initial = (config.shopName?.trim()[0] ?? "G").toUpperCase();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `rgb(${tokens.brand600.split(" ").join(",")})`,
        color: `rgb(${tokens.pageBg.split(" ").join(",")})`,
        fontSize: 44,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>,
    size
  );
}
