import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  // This points to the worker file we're about to create
  swSrc: "app/sw.ts", 
  swDest: "public/sw.js",
  // Disable Serwist in development so it doesn't cache your code changes
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* Your existing config options here (if any) */
};

export default withSerwist(nextConfig);