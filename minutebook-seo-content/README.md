# Minute book SEO content — handoff notes
2026-07-16 · For VS Code implementation. Three files in this folder.

## Files

1. **keyword-list.md** — prioritized keyword list from your GSC export + top-5 competitor analysis (corpcentre.ca, corporateminutebooks.ca, ownr.co, incorpdirect.ca, minutebox.com). Tier 1 = queries you already rank pos 4–11 for with no content.
2. **article-where-corporate-documents-belong.md** — full article copy. Suggested destination: `content/articles/where-corporate-documents-belong-minute-book-canada.md`. Targets the Tier 1 near-win long-tails (director resolutions, share subscription/issuance, registers) + "annual resolutions".
3. **service-page-digital-minute-book-canada.md** — full service page copy. Suggested destination: `content/minute-books/digital-minute-book-canada.md`. Targets "digital minute book", "virtual minute book", "corporate minute book service canada". Acts as the Canada-wide hub above the 14 existing province pages.

## Implementation checklist

- Both files carry frontmatter matching repo conventions (`title`, `slug`, `section`, `description`). Slugs are lowercase = filenames, per `content.ts`.
- Delete the `<!-- IMPLEMENTATION NOTES -->` comment blocks before publish.
- Prices in both files come from `web/src/lib/service-config.ts` and the existing province pages ($299/$749/$1,399 packages; $79 resolutions; $49 share certificates; $99 by-laws; $99 annual return). Re-verify against service-config.ts before publish.
- Wire the bracketed CTAs on the service page to the corporate-docs order flows (`minute-book-new`, `minute-book-update`, `share-certificate`, `director-resolution`, `shareholder-resolution`, `bylaws`).
- Link the jurisdiction list on the service page to all 14 existing `/minute-books/` province pages, and add a link from each province page (and from `guides/what-is-a-corporate-minute-book-canada`) back to the new hub page.
- Cross-link both ways with the annual return articles at the "annual resolutions vs annual return" sections.
- Keep the FAQ answers as-is (40–55 words each) — they're formatted for featured snippets; add FAQPage JSON-LD schema on both pages.
- Consider a follow-up page for "corporate minute book setup calgary" (21 impressions, local intent) — a short Alberta/Calgary-angled variant or a Calgary section on the Alberta province page.
