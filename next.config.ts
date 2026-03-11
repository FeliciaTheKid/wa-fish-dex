import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// 1. Define your Next.js configuration
const nextConfig: NextConfig = {
  // 🗺️ This is the "Leaflet Fix"
  // It tells Next.js to compile these specific libraries so they don't 
  // crash the Vercel build due to "Window is not defined" or ESM errors.
  transpilePackages: ['react-leaflet', 'leaflet'],

  // Optional: Add this if you experience hydration errors with maps
  // reactStrictMode: false,
};

// 2. Wrap the config with Serwist
const withSerwist = withSerwistInit({
  // Points to your service worker source (the "brain")
  swSrc: "app/sw.ts", 
  // Where the compiled service worker will live
  swDest: "public/sw.js",
  // Disable Serwist in development so you don't have to keep 
  // clearing your cache while coding.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);