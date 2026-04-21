import type { NextConfig } from "next";

const embedCacheControl =
  process.env.NODE_ENV === "production"
    ? "public, max-age=31536000, immutable"
    : "no-store";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/jobs",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, ngrok-skip-browser-warning",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
      {
        source: "/api/jobs/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, ngrok-skip-browser-warning",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
      {
        source: "/embed/jobs/:path*",
        headers: [
          // Allow embedding the widget script cross-origin (e.g. WordPress → jobs domain).
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: embedCacheControl },
        ],
      },
    ];
  },
};

export default nextConfig;
