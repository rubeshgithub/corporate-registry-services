import { companies } from "@/lib/registrar-mongo";

/**
 * GET /sitemap-corporations.xml
 *
 * SEO discovery sitemap for the /corporation/[slug] profile pages. Feeds
 * Google the highest-value slice: corps that are Active, gazetted in 2020+,
 * with a non-empty address (so the profile has real content to render).
 *
 * Capped at 50,000 URLs per Google's sitemap spec. When the corpus grows
 * past that, split into multiple sitemap files (see MetadataRoute.Sitemap
 * with `generateSitemaps` or add a numbered variant here).
 *
 * Cached 24 hours to avoid hammering Mongo when crawlers refetch.
 */

export const dynamic = "force-dynamic";
export const revalidate = 86400;      // 24 hours

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
const MAX_URLS = 50_000;

export async function GET() {
  const col = await companies();
  const since = new Date("2020-01-01");

  const cursor = col.find(
    {
      /* Only meaningfully-indexable profiles: real slug (skip name-only
         shells), address populated, and a lastEventDate from 2020+. */
      slug: { $exists: true, $ne: "" },
      _id: { $not: /^name:/ },
      "address.city": { $nin: [null, ""] },
      "status.derived": { $in: ["Incorporated", "Registered", "Revived", "Continued"] },
      "status.lastEventDate": { $gte: since },
    },
    { projection: { slug: 1, "status.lastEventDate": 1 } },
  )
    .sort({ "status.lastEventDate": -1 })
    .limit(MAX_URLS);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for await (const doc of cursor) {
    const lastMod = doc.status?.lastEventDate?.toISOString().slice(0, 10) ?? "";
    xml += `  <url><loc>${BASE_URL}/corporation/${escapeXml(doc.slug ?? "")}</loc>`;
    if (lastMod) xml += `<lastmod>${lastMod}</lastmod>`;
    xml += `<changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
  }

  xml += `</urlset>\n`;

  return new Response(xml, {
    status:  200,
    headers: {
      "Content-Type":  "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
