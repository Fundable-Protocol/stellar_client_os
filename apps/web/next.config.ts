import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: "../../",
  },

  /**
   * CORS headers for image responses served through Next.js routes.
   *
   * iOS 14 Safari caches resources as "opaque" (no-CORS) responses when the
   * server omits CORS headers, and then refuses to render them when the page
   * later requests them in a cross-origin context.  Setting
   * Cross-Origin-Resource-Policy to "cross-origin" (and the Access-Control
   * headers below) ensures every image response carries proper CORS metadata
   * so Safari stores it as a tainted-but-usable CORS response instead.
   *
   * These headers are applied to the Next.js image optimisation route
   * (_next/image) and to any /api routes that proxy or redirect to image CDN
   * assets (e.g. pre-signed S3 URLs returned by the evidence upload API).
   */
  async headers() {
    return [
      {
        // Next.js image optimisation endpoint
        source: "/_next/image",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Vary", value: "Origin" },
        ],
      },
      {
        // API routes that return or redirect to evidence media (S3, IPFS, CDN)
        source: "/api/campaigns/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },

  images: {
    /**
     * remotePatterns replaces the deprecated `domains` config.
     * Even though all campaign Image components use unoptimized={true} today
     * (bypassing the optimisation pipeline), these patterns future-proof the
     * config and allow the Next.js Image component to validate external URLs
     * without throwing in strict mode.
     *
     * Covers:
     *   - AWS S3 evidence bucket (us-east-1; adjust region if the bucket moves)
     *   - IPFS public gateway fallback
     *   - Unsplash (used in campaign wizard placeholder / sample data)
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "ipfs.io",
        pathname: "/ipfs/**",
      },
      {
        protocol: "https",
        hostname: "**.ipfs.dweb.link",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
