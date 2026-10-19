import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TS errors fail the build again (fixed 2026-10-19). CI also runs typecheck.
  // ESLint stays off in builds until an eslint config is restored.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
