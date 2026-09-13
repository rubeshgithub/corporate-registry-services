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

      /* Federal-vs-provincial moved from /guides to /articles. A slug is
       * normally untouchable because it carries ranking history — this one
       * had none to carry: 1,515 words, 22 inbound links, correctly indexed,
       * and zero impressions. Over the same 7-day window articles averaged
       * 145 impressions per page at 1.15% CTR against guides' 44 at 0.45%,
       * from a near-identical average position. The redirect is here because
       * the old URL was public and internally linked. */
      {
        source: "/guides/federal-vs-provincial-incorporation-canada",
        destination: "/articles/federal-vs-provincial-incorporation-canada",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
