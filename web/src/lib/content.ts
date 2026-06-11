import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

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
};

export type ContentPage = {
  section: Section;
  slug: string;
  title: string;
  contentHtml: string;
};

export type ContentMeta = Omit<ContentPage, "contentHtml">;

function slugify(filename: string) {
  return filename.replace(/\.md$/, "").toLowerCase();
}

function rebrand(text: string) {
  return text; // Content already uses CRS branding
}

export function listSection(section: Section): ContentMeta[] {
  const dir = path.join(CONTENT_DIR, section);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
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

  const rebranded = rebrand(content);

  const processed = await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(rebranded);
  const contentHtml = processed.toString();

  return {
    section,
    slug,
    title: rebrand((data.title as string) ?? match.replace(".md", "")),
    contentHtml,
  };
}
