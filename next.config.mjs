import { networkInterfaces } from "node:os";

/**
 * Next 16 refuses a dev request whose Host is not localhost unless the host is
 * listed here, and the refusal lands before hydration — the page renders but
 * every client component is inert. A shop terminal or a phone reaches the dev
 * server by LAN IP, so those addresses go in the list.
 *
 * Own interfaces are read at startup; DEV_ORIGINS (comma-separated) covers a
 * hostname or a tunnel the machine cannot see itself.
 */
const devOrigins = [
  ...Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address),
  ...(process.env.DEV_ORIGINS?.split(",") ?? []),
]
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // `next build` writes over whatever `next dev` is serving, which leaves the
  // dev server without its own error components. Set NEXT_DIST_DIR to build
  // somewhere else while a dev server is running (see: npm run build:check).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: devOrigins,
};

export default nextConfig;
