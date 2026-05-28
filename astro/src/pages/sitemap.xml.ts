import { getCollection } from 'astro:content';

const BASE = 'https://corporateregistryservices.ca';

function url(path: string, priority: string, changefreq: string) {
  return `  <url>
    <loc>${BASE}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
  const [profiles, goodStanding, annualReturn, minuteBooks, incorporation, articles, guides] = await Promise.all([
    getCollection('profile-reports'),
    getCollection('good-standing'),
    getCollection('annual-return'),
    getCollection('minute-books'),
    getCollection('incorporation'),
    getCollection('articles'),
    getCollection('guides'),
  ]);

  const staticPages = [
    url('/', '1.0', 'weekly'),
    url('/good-standing', '0.9', 'monthly'),
    url('/profile-reports', '0.9', 'monthly'),
    url('/annual-return', '0.9', 'monthly'),
    url('/minute-books', '0.9', 'monthly'),
    url('/incorporation', '0.9', 'monthly'),
    url('/guides', '0.8', 'monthly'),
    url('/articles', '0.8', 'monthly'),
    url('/about', '0.6', 'yearly'),
    url('/contact', '0.7', 'yearly'),
  ];

  const dynamicPages = [
    ...goodStanding.map(e => url(`/good-standing/${e.id}`, '0.8', 'yearly')),
    ...profiles.map(e => url(`/profile-reports/${e.id}`, '0.8', 'yearly')),
    ...annualReturn.map(e => url(`/annual-return/${e.id}`, '0.8', 'yearly')),
    ...minuteBooks.map(e => url(`/minute-books/${e.id}`, '0.8', 'yearly')),
    ...incorporation.map(e => url(`/incorporation/${e.id}`, '0.8', 'yearly')),
    ...guides.map(e => url(`/guides/${e.id}`, '0.7', 'yearly')),
    ...articles.map(e => url(`/articles/${e.id}`, '0.6', 'monthly')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticPages, ...dynamicPages].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
