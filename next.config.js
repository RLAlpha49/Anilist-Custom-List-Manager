import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shouldLogFullFetchUrls =
  process.env.NEXT_FETCH_LOG_FULL_URL === "1" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.NEXT_FETCH_LOG_FULL_URL !== "0");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
    ],
  },
  logging: {
    fetches: {
      fullUrl: shouldLogFullFetchUrls,
    },
  },
};

export default nextConfig;
