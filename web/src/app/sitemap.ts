import type { MetadataRoute } from "next";
import { listAllPages, SECTIONS } from "@/lib/content";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.docu10.ca";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = listAllPages();
  const now = new Date();

  const static_routes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const section_routes: MetadataRoute.Sitemap = SECTIONS.map((section) => ({
    url: `${BASE_URL}/${section}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const content_routes: MetadataRoute.Sitemap = pages.map((page) => ({
    url: `${BASE_URL}/${page.section}/${page.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: page.section === "guides" || page.section === "articles" ? 0.7 : 0.9,
  }));

  return [...static_routes, ...section_routes, ...content_routes];
}
