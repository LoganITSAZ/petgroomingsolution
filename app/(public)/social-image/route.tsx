import { ImageResponse } from "next/og";
import { getConfig } from "@/lib/config";
import { resolveTheme } from "@/lib/themes";
import { SHOP_TIMEZONE } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The card a link to this shop shows on a phone.
 *
 * Every word and colour on it is the shop's own: the name, the tagline it
 * already shows on the site, and the live theme. It used to be one shop's
 * slogan and an amber hex baked into this file, which meant every deployment
 * shared a stranger's card.
 */
export async function GET() {
  const config = await getConfig();

  // The shop's own date decides the seasonal theme, not the crawler's.
  const [, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .split("-")
    .map(Number);
  const { tokens } = resolveTheme(config, { month, day });
  const rgb = (triplet: string) => `rgb(${triplet.split(" ").join(",")})`;

  const tagline = config.seoSocialTagline?.trim() || config.shopTagline?.trim() || null;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: rgb(tokens.pageBg),
        color: rgb(tokens.ink),
        borderBottom: `24px solid ${rgb(tokens.brand600)}`,
      }}
    >
      <div style={{ fontSize: 28, color: rgb(tokens.brand700), marginBottom: 28, letterSpacing: 2 }}>PET GROOMING</div>
      <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{config.shopName}</div>
      {tagline && <div style={{ fontSize: 30, marginTop: 32, color: rgb(tokens.muted) }}>{tagline}</div>}
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" } },
  );
}
