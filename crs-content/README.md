# CRS Website Content — Not-for-Profit Clusters

Two SEO content clusters for bizfile.ca (Corporate Registry Services / BizFile Canada), researched and fact-checked against official government sources on **2026-07-17**. Hand this folder to your build tooling; each `.md` file is one page with YAML frontmatter (title, metaDescription, slug, keywords, schema suggestions).

## Structure

```
crs-content/
├── nfp-incorporation/          # Cluster 1 — 16 pages
│   ├── index.md                # Pillar: /not-for-profit/
│   ├── federal.md              # + 14 jurisdiction guides (/not-for-profit/{slug})
│   ├── ontario.md ... nunavut.md
│   └── book-free-consultation.md   # CTA landing page + full booking-form field spec
├── nfp-grants/                 # Cluster 2 — 15 pages
│   ├── index.md                # Pillar: /nfp-grants/
│   └── federal.md ... nunavut.md   # 14 jurisdiction guides (/nfp-grants/{slug})
├── seo/
│   ├── keyword-strategy-nfp-incorporation.md
│   └── keyword-strategy-nfp-grants.md
└── _spec/page-template.md      # The editorial/SEO spec the pages were written to
```

## Build notes for the dev

1. Frontmatter → `<title>`, meta description, canonical URL from `slug`. Render `lastUpdated` visibly ("Reviewed July 2026").
2. Generate FAQPage JSON-LD from each page's `## Frequently asked questions` section (H3 = question, following paragraph = answer). Add BreadcrumbList site-wide.
3. The consultation page (`book-free-consultation.md`) contains a complete multi-step form specification — field types, validation rules, and the per-jurisdiction board-minimum table for dynamic validation. The blockquoted "Implementation note" is for you, not for rendering.
4. Internal links use root-relative slugs (`/not-for-profit/alberta`, `/nfp-grants/`) — keep the URL structure or search-replace consistently.
5. External links point only to official government sources verified on 2026-07-17. Fees, deadlines, and program amounts change: re-verify quarterly (see refresh calendar in the SEO strategy docs).

## Internal linking model

Pillar ↔ 14 jurisdiction pages (both clusters) · each incorporation page ↔ its grants twin · every page → `/not-for-profit/book-free-consultation` (primary CTA). Conversion path to track: grants page → incorporation page → consultation.
