import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import type { FaqItem } from "./structured-data";

// Content lives one level above the Next.js project root
const CONTENT_DIR = path.join(process.cwd(), "..", "content");

export const SECTIONS = [
  "annual-return",
  "good-standing",
  "incorporation",
  "minute-books",
  "profile-reports",
  "articles",
  "guides",
  "not-for-profit",
  "nfp-grants",
] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  "annual-return":   "Annual Returns",
  "good-standing":   "Certificates of Good Standing",
  "incorporation":   "Incorporation",
  "minute-books":    "Minute Books",
  "profile-reports": "Corporate Profile Reports",
  "articles":        "Articles",
  "guides":          "Guides",
  "not-for-profit":  "Not-for-Profit Incorporation",
  "nfp-grants":      "Grants for Not-for-Profits",
};

export type ContentPage = {
  section: Section;
  slug: string;
  title: string;
  h1?: string;
  description?: string;
  contentHtml: string;
  widgetEyebrow?: string;
  widgetTitle?:   string;
  widgetSub?:     string;
  faq?:           FaqItem[];  // parsed from frontmatter `faq: [{q, a}]` OR auto-extracted from body H3s
  /** From frontmatter `lastUpdated`. Rendered visibly as "Reviewed <Month YYYY>"
   *  on the NFP cluster pages per the source-content spec — the pages are
   *  fact-checked against government sources and freshness is a trust signal. */
  lastUpdated?:   string;
  /** Optional jurisdiction hint from frontmatter — used by the NFP cluster
   *  to render a small chip on the page. */
  jurisdiction?:  string;
};

/** Coerce a parsed frontmatter value into a FaqItem[] or undefined. Silently
 *  drops malformed entries so a single typo doesn't break the whole page. */
function parseFaq(raw: unknown): FaqItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: FaqItem[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const q = typeof rec.q === "string" ? rec.q.trim() : "";
      const a = typeof rec.a === "string" ? rec.a.trim() : "";
      if (q && a) items.push({ q, a });
    }
  }
  return items.length > 0 ? items : undefined;
}

export type ContentMeta = Omit<ContentPage, "contentHtml">;

// Strip markdown syntax and grab the first ~155 chars of prose as a
// meta-description fallback for pages that don't declare their own.
function firstParagraphPlain(md: string, maxLen = 155): string {
  const body = md
    .replace(/^---[\s\S]*?---\s*/m, "")  // in case caller passes raw file
    .split(/\n\s*\n/)
    .find((p) => p.trim() && !p.trim().startsWith("#"));
  if (!body) return "";
  const cleaned = body
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1).trimEnd() + "…" : cleaned;
}

function slugify(filename: string) {
  return filename.replace(/\.md$/, "").toLowerCase();
}

function rebrand(text: string) {
  return text; // Content already uses CRS branding
}

/**
 * The article template already renders the frontmatter `title` (or `h1`)
 * as the page H1. When the markdown body also opens with `# ...`, the
 * visitor sees two identical H1s stacked and Google discounts the page
 * for H1 spam. Strip a leading H1 from the body so authors don't need
 * to remember not to write one.
 */
function stripLeadingH1(md: string): string {
  return md.replace(/^\s*#\s+[^\n]*\n+/, "");
}

/**
 * Extract a FAQ list from the body by parsing the "## Frequently asked
 * questions" section — each H3 becomes a question, its following
 * paragraph the answer. Used by the NFP cluster pages so authors can
 * write FAQs in prose (with markdown formatting, links, etc.) instead
 * of stuffing them into frontmatter YAML.
 *
 * Frontmatter `faq: [{q, a}]` still wins when present — this only runs
 * when frontmatter FAQ is absent. Answers are trimmed of markdown link
 * syntax before being fed into FAQPage JSON-LD (Google prefers plain
 * text in schema), while the visible body keeps full formatting.
 */
function extractFaqFromBody(md: string): FaqItem[] | undefined {
  // Find the FAQ heading (case-insensitive, either "Frequently asked
  // questions" or "FAQ"). Capture everything from there until the next H2
  // or end of document.
  const match = md.match(/^##\s+(?:Frequently asked questions|FAQ)\s*\n([\s\S]*?)(?=^##\s|\z)/im);
  if (!match) return undefined;
  const section = match[1];

  // Split on H3s — each H3 is a question. The regex captures the H3 text
  // and everything up to the next H3 (or end of section).
  const items: FaqItem[] = [];
  const qRe = /^###\s+([^\n]+)\n+([\s\S]*?)(?=^###\s|\z)/gm;
  let m: RegExpExecArray | null;
  while ((m = qRe.exec(section)) !== null) {
    const q = m[1].trim();
    // Take the first paragraph of the answer for the schema — collapse
    // links, strip markdown syntax, single-line. This matches Google's
    // preference for plain-text FAQ answers.
    const rawAnswer = m[2].trim().split(/\n\s*\n/)[0] ?? "";
    const a = rawAnswer
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // links → text
      .replace(/[*_`>]/g, "")                     // strip emphasis + code marks
      .replace(/\s+/g, " ")
      .trim();
    if (q && a) items.push({ q, a });
  }
  return items.length > 0 ? items : undefined;
}

export function listSection(section: Section): ContentMeta[] {
  const dir = path.join(CONTENT_DIR, section);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    // Skip _index.md — it holds pillar (section-index) content, not a
    // regular routed slug. Handled separately via getPillar().
    .filter((f) => !f.startsWith("_"))
    .map((filename) => {
      const raw = fs.readFileSync(path.join(dir, filename), "utf8");
      const { data } = matter(raw);
      return {
        section,
        slug: slugify(filename),
        title: (data.title as string) ?? filename.replace(".md", ""),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Read the pillar (section-index) content from `_index.md` if present.
 *  Returns null for sections that don't ship a pillar file — the section
 *  page renders the standard card grid in that case. */
export async function getPillar(section: Section): Promise<ContentPage | null> {
  const dir = path.join(CONTENT_DIR, section);
  const file = path.join(dir, "_index.md");
  if (!fs.existsSync(file)) return null;

  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  const rebranded = stripLeadingH1(rebrand(content));
  const processed = await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(rebranded);
  const contentHtml = processed.toString();

  const description = ((data.description as string | undefined) ?? (data.metaDescription as string | undefined))?.trim()
    || firstParagraphPlain(content);

  return {
    section,
    slug: "",   // pillar has no slug — it's the section index
    title: rebrand((data.title as string) ?? section),
    h1: typeof data.h1 === "string" ? rebrand(data.h1) : undefined,
    description,
    contentHtml,
    faq:          parseFaq(data.faq) ?? extractFaqFromBody(content),
    lastUpdated:  typeof data.lastUpdated === "string" ? data.lastUpdated : undefined,
    jurisdiction: typeof data.jurisdiction === "string" ? data.jurisdiction : undefined,
  };
}

export function listAllPages(): ContentMeta[] {
  return SECTIONS.flatMap(listSection);
}

export async function getPage(
  section: Section,
  slug: string
): Promise<ContentPage | null> {
  const dir = path.join(CONTENT_DIR, section);
  if (!fs.existsSync(dir)) return null;

  // Match slug case-insensitively against filenames
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const match = files.find((f) => slugify(f) === slug.toLowerCase());
  if (!match) return null;

  const raw = fs.readFileSync(path.join(dir, match), "utf8");
  const { data, content } = matter(raw);

  const rebranded = stripLeadingH1(rebrand(content));

  const processed = await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(rebranded);
  const contentHtml = processed.toString();

  // NFP cluster uses `metaDescription` in frontmatter; existing content uses
  // `description`. Accept either — the field feeds the same <meta> tag.
  const description =
    ((data.description as string | undefined)?.trim() || (data.metaDescription as string | undefined)?.trim()) ||
    firstParagraphPlain(content);

  return {
    section,
    slug,
    title: rebrand((data.title as string) ?? match.replace(".md", "")),
    h1: typeof data.h1 === "string" ? rebrand(data.h1) : undefined,
    description,
    contentHtml,
    widgetEyebrow: typeof data.widgetEyebrow === "string" ? data.widgetEyebrow : undefined,
    widgetTitle:   typeof data.widgetTitle   === "string" ? data.widgetTitle   : undefined,
    widgetSub:     typeof data.widgetSub     === "string" ? data.widgetSub     : undefined,
    // Frontmatter `faq` wins when present. Otherwise auto-extract from a
    // "## Frequently asked questions" body section — the NFP cluster
    // writes FAQs in prose rather than YAML.
    faq:           parseFaq(data.faq) ?? extractFaqFromBody(content),
    lastUpdated:   typeof data.lastUpdated === "string" ? data.lastUpdated : undefined,
    jurisdiction:  typeof data.jurisdiction === "string" ? data.jurisdiction : undefined,
  };
}
