import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Gentle Groomer",
    template: "%s | Gentle Groomer",
  },
  description: "The best and bubbliest groomer in town. Patience, Love & Kindness.",
  metadataBase: new URL("https://gentlegroomer.net"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
