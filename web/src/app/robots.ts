import type { MetadataRoute } from "next";

/**
 * robots.txt — controls what search engines crawl. Explicitly points at
 * both sitemaps so Google discovers the corporation profile corpus and
 * the static/content pages via separate feeds.
 *
 * Admin + order-flow routes are gated (they're either noindex-metadata'd
 * per-page or behind auth), but we blocklist them here as belt-and-braces.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow:     "/",
        disallow:  [
          "/admin/",
          "/api/",
          "/order/thanks",
          "/order/status",
          "/order/company-status-check-canada",
          "/unsubscribed",
          "/o/",            // outreach deep-link tokens — should never be indexed
        ],
      },
    ],
    sitemap: [
      `${BASE_URL}/sitemap.xml`,
      `${BASE_URL}/sitemap-corporations.xml`,
    ],
    host: BASE_URL,
  };
}
