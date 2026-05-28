// Astro content collections.
// All .md files live ONE LEVEL UP at ../../../content/<section>/*.md
// We load them via the `glob` loader (Astro 4.14+).

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pageSchema = z.object({
  title: z.string(),
  source_url: z.string().url().optional(),
  slug: z.string(),
  section: z.string(),
});

const core = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/core' }),
  schema: pageSchema,
});
const profileReports = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/profile-reports' }),
  schema: pageSchema,
});
const goodStanding = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/good-standing' }),
  schema: pageSchema,
});
const annualReturn = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/annual-return' }),
  schema: pageSchema,
});
const minuteBooks = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/minute-books' }),
  schema: pageSchema,
});
const incorporation = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/incorporation' }),
  schema: pageSchema,
});
const articles = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/articles' }),
  schema: pageSchema,
});
const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: '../content/guides' }),
  schema: pageSchema,
});

export const collections = {
  core,
  'profile-reports': profileReports,
  'good-standing': goodStanding,
  'annual-return': annualReturn,
  'minute-books': minuteBooks,
  incorporation,
  articles,
  guides,
};
