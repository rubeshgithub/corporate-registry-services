import { listSection, SECTION_LABELS, type ContentMeta, type Section } from "./content";

/**
 * Compute related-link blocks for a content page. Aims to give Google (and
 * human readers) topical cross-paths without hand-curating a graph per article:
 *
 *   - Same-section siblings ("Other provinces" for jurisdiction pages)
 *   - Cross-section link to the equivalent service/article page
 *   - Curated /guides links relevant to the service family
 *   - External link to MinuteBook for the post-filing minute-book upsell
 */

export type RelatedLink = { href: string; label: string; external?: boolean };
export type RelatedGroup = { title: string; links: RelatedLink[] };

/* Map slug → service-family key so we can look up the right cross-section. */
function serviceFamily(slug: string): "annual-return" | "incorporation" | "good-standing" | "profile-report" | "minute-book" | null {
  const s = slug.toLowerCase();
  if (s.includes("annual-return"))    return "annual-return";
  if (s.includes("incorporation"))    return "incorporation";
  if (s.includes("good-standing"))    return "good-standing";
  if (s.includes("profile-report"))   return "profile-report";
  if (s.includes("minute-book"))      return "minute-book";
  return null;
}

/* Guide slugs that pair naturally with each service family. Only guides that
   actually exist in content/guides/ get emitted, so we don't 404 if content
   moves later. */
const FAMILY_GUIDES: Record<string, string[]> = {
  "annual-return":   ["annual-return-filing-deadlines-canada"],
  "incorporation":   ["federal-vs-provincial-incorporation-canada", "nuans-name-search-canada-guide"],
  "good-standing":   ["what-is-a-certificate-of-good-standing-canada", "corporate-profile-report-vs-certificate-of-good-standing"],
  "profile-report":  ["corporate-profile-report-vs-certificate-of-good-standing"],
  "minute-book":     ["what-is-a-corporate-minute-book-canada"],
};

/* When we're on an article about a service family, we also want to point at the
   canonical service section page (/annual-return, /incorporation, etc.). */
const FAMILY_SERVICE_SECTION: Record<string, Section> = {
  "annual-return":   "annual-return",
  "incorporation":   "incorporation",
  "good-standing":   "good-standing",
  "profile-report":  "profile-reports",
  "minute-book":     "minute-books",
};

const MINUTEBOOK_URL = "https://minutebook.corporateregistryservices.ca";

/**
 * Build the related-links block for a given content page.
 * `maxSiblings` caps how many same-section siblings we surface — 5 is a
 * sweet spot for browse-ability without turning the block into a wall.
 */
export function getRelatedGroups(
  section: Section,
  slug: string,
  { maxSiblings = 5 }: { maxSiblings?: number } = {},
): RelatedGroup[] {
  const groups: RelatedGroup[] = [];
  const family = serviceFamily(slug);

  /* ── 1. Siblings in the same section ── */
  const allInSection = listSection(section);
  const siblings = allInSection.filter((p) => p.slug !== slug).slice(0, maxSiblings);
  if (siblings.length) {
    groups.push({
      title: section === "articles"
        ? "How to file in other provinces"
        : `Other ${SECTION_LABELS[section].toLowerCase()} pages`,
      links: siblings.map((p) => ({ href: `/${p.section}/${p.slug}`, label: p.title })),
    });
  }

  /* ── 2. Cross-section link to the canonical service page ── */
  if (family) {
    const targetSection = FAMILY_SERVICE_SECTION[family];
    if (targetSection && targetSection !== section) {
      /* Try to find a jurisdiction-matched page in the target section. */
      const targets = listSection(targetSection);
      // Cheap match: look for a target slug that shares a jurisdiction word.
      const jurisdictionMatch = findJurisdictionMatch(slug, targets);
      const link: RelatedLink = jurisdictionMatch
        ? { href: `/${jurisdictionMatch.section}/${jurisdictionMatch.slug}`, label: jurisdictionMatch.title }
        : { href: `/${targetSection}`, label: SECTION_LABELS[targetSection] };
      groups.push({
        title: "Related service page",
        links: [link],
      });
    }
  }

  /* ── 3. Guides relevant to this service family ── */
  if (family && FAMILY_GUIDES[family]?.length) {
    const guides = listSection("guides");
    const guideLinks: RelatedLink[] = FAMILY_GUIDES[family]
      .map((wanted) => guides.find((g) => g.slug === wanted))
      .filter((g): g is ContentMeta => !!g)
      .map((g) => ({ href: `/${g.section}/${g.slug}`, label: g.title }));
    if (guideLinks.length) {
      groups.push({ title: "Related guides", links: guideLinks });
    }
  }

  /* ── 4. MinuteBook cross-sell ── */
  groups.push({
    title: "After filing",
    links: [
      family === "minute-book"
        ? { href: `${MINUTEBOOK_URL}`,               label: "Build a compliance-ready minute book on MinuteBook", external: true }
        : { href: `${MINUTEBOOK_URL}/minute-books`,  label: "Keep your minute book up to date on MinuteBook",      external: true },
    ],
  });

  return groups;
}

/** Return the first target page whose slug shares a jurisdiction word with the source slug. */
function findJurisdictionMatch(sourceSlug: string, candidates: ContentMeta[]): ContentMeta | undefined {
  const words = sourceSlug.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
  return candidates.find((c) => {
    const cs = c.slug.toLowerCase();
    return words.some((w) => cs.includes(w) && ["alberta", "british-columbia", "manitoba", "new-brunswick", "newfoundland", "northwest", "nova-scotia", "nunavut", "ontario", "prince-edward-island", "quebec", "saskatchewan", "yukon", "federal", "canada"].some((j) => cs.includes(j) && w.includes(j)));
  });
}
