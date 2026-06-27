import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Security headers — applied to every response in production.
// CSP is permissive enough for our React app + cdnjs but blocks unknown scripts.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  // HSTS — only set if served via HTTPS (production). Browsers ignore on HTTP.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' kept for Next.js inline runtime + sw registration; can be tightened with nonces.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      // worker-src — Three.js + drei use Blob URLs for off-thread compilation
      "worker-src 'self' blob:",
      // child-src — legacy alias for worker-src in older browsers
      "child-src 'self' blob:",
      "connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://api.callmebot.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required for small Docker images via multi-stage build
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      // Apply security headers to all routes
      { source: "/(.*)", headers: securityHeaders },
      // Long-cache for static assets — Next.js handles fingerprinting
      {
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Service worker should never be cached
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;