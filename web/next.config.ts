import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/company-search",
        destination: "/canada-corporations-search",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
