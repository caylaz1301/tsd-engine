import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // DOCX uploads allow 30 MiB; leave room for proxy/request overhead.
    proxyClientMaxBodySize: "32mb",
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/images/:path*", destination: `${backendUrl}/images/:path*` },
    ];
  },
};

export default nextConfig;
