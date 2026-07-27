import { type Collection, ObjectId } from "mongodb";
import { db } from "./mongo";

/**
 * CMS storage layer.
 *
 * Draft articles live in the `cms_articles` collection. Published articles
 * are ALSO written to git (as .md files in content/{section}/{slug}.md) by
 * the publish route, so Google indexes the file-based version served by
 * the [section]/[slug] catch-all renderer. The Mongo record retains
 * status: "published" for the CMS list, but the source of truth for what
 * users see is the git-committed file.
 *
 * Two-storage rationale: drafts need fluid edit-in-place (Mongo wins);
 * published articles need Render deploy + Google crawl + version history
 * (git wins).
 */

export type Section =
  | "articles"
  | "guides"
  | "annual-return"
  | "incorporation"
  | "minute-books"
  | "good-standing"
  | "profile-reports"
  | "not-for-profit"
  | "nfp-grants";

export const SECTIONS: Section[] = [
  "articles",
  "guides",
  "annual-return",
  "incorporation",
  "minute-books",
  "good-standing",
  "profile-reports",
  "not-for-profit",
  "nfp-grants",
];

export type CmsFaq = { q: string; a: string };

export type CmsArticleDoc = {
  _id?:             ObjectId;
  slug:             string;                 // kebab-case, unique within (section, slug)
  section:          Section;
  title:            string;                 // <title> tag
  h1?:              string | null;          // optional H1 override, else title used
  description:      string;                 // <meta description>
  body:             string;                 // markdown, no front-matter
  faq?:             CmsFaq[] | null;
  status:           "draft" | "published";
  createdAt:        Date;
  updatedAt:        Date;
  createdBy:        string;                 // "cms" | "api" | user identifier
  publishedAt?:     Date | null;
  publishedCommit?: string | null;          // git SHA when last published
  publishedUrl?:    string | null;          // /{section}/{slug} once live
  lastEditedBy?:    string | null;
};

export async function cmsArticles(): Promise<Collection<CmsArticleDoc>> {
  return (await db()).collection<CmsArticleDoc>("cms_articles");
}

let indexesEnsured = false;
export async function ensureCmsIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const col = await cmsArticles();
    await col.createIndex({ section: 1, slug: 1 }, { unique: true });
    await col.createIndex({ status: 1, updatedAt: -1 });
    await col.createIndex({ updatedAt: -1 });
  } catch (e) {
    indexesEnsured = false;
    console.error("[cms-mongo] failed to ensure indexes:", e);
  }
}
