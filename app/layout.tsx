import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { getConfig } from "@/lib/config";
import "./globals.css";
import "./liquid-glass.css";
import "./workspace.css";

/**
 * One face, carried on a CSS variable so Tailwind's `font-sans` resolves to it
 * everywhere — public site, back office and kiosk alike.
 *
 * Plus Jakarta Sans over the usual neutral grotesque: this is a shop tool with
 * a warm amber identity and pets on every screen, and its humanist shapes read
 * as friendly at 15px without going soft. The wide weight range is what lets
 * the dense screens build hierarchy with weight instead of with more borders.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

/**
 * The display face, and the only place the app has a voice of its own.
 *
 * Everything set at reading size stays on Plus Jakarta — the back office is
 * 15px all day and a quirky face there is a tax on the person reading it.
 * Bricolage carries the headline sizes instead: the public hero, a page's own
 * title, and the kiosk, where a pet's name is read from across the lobby. Its
 * optical-size axis is why it can do both ends of that range from one file.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
      variable: "--font-display",
});

/**
 * The shop names its own tabs.
 *
 * "Pet Grooming Shop" was this app's name, not the shop's — a customer with
 * six tabs open saw the developer's placeholder where the business should be,
 * and so did every bookmark. `shopName` is already the single place the shop's
 * name is typed (it signs the email too), so the title template reads from it.
 *
 * Reading SystemConfig here makes every page that inherits the template
 * request-time rather than build-time, which is the same rule the config-reading
 * pages already follow: a static title would freeze the old name into the
 * bundle until the next deploy, which is exactly the bug being fixed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const name = config.shopName?.trim() || "Pet Grooming Shop";

  return {
    title: { default: name, template: `%s | ${name}` },
    description:
      config.shopTagline?.trim() ||
      "Pet grooming appointments, customer care, and shop operations.",
    metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost"),
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
