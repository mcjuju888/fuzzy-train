import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // The scouting routes fan out to Chess.com / Lichess and can legitimately
    // hold a request open while paging archives.
    proxyTimeout: 120_000,
  },
  async headers() {
    return [
      {
        // The vendored Stockfish build is single-threaded, so it needs no
        // SharedArrayBuffer and therefore no cross-origin isolation — adding
        // COEP/COOP here would buy nothing and restrict embedding. The assets
        // are versioned by the package, so they cache hard.
        source: "/engine/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
