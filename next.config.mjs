/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // `next build` writes over whatever `next dev` is serving, which leaves the
  // dev server without its own error components. Set NEXT_DIST_DIR to build
  // somewhere else while a dev server is running (see: npm run build:check).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
