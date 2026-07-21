import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Shoe photo uploads go through a server action as multipart form data.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
