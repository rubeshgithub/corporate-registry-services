import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/company-search",
        destination: "/canada-corporations-search",
        permanent: true,
      },

      /* Two internal SEO strategy documents were filed into routed content
       * directories by mistake and went live as public articles — they set
       * out target keywords, conversion reasoning and competitor analysis.
       * The files now live in crs-content/seo/ (staging, unrouted).
       *
       * 301 rather than letting them 404: the URLs were public and may have
       * been indexed or linked, and a redirect hands anything they accrued
       * to the real page on the same topic while giving a visitor somewhere
       * useful to land. */
      {
        source: "/articles/keyword-strategy-corporate-documents-canada",
        destination: "/articles/how-to-get-corporate-documents-in-canada",
        permanent: true,
      },
      {
        source: "/profile-reports/keyword-strategy-corporate-profile-reports",
        destination: "/profile-reports",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
