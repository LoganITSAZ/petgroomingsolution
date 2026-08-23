/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gentlegroomer.net",
      },
    ],
  },
};

export default nextConfig;
