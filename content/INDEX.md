# BizFile Canada — Content Index

92 markdown files organized in 7 sections, mirroring the live site at https://bizfile.ca

## Folders

- `core/` — 9 files: homepage, About, Contact, Articles hub, and 5 Canada-level hub pages
- `profile-reports/` — 14 files: one per Canadian jurisdiction
- `good-standing/` — 14 files: one per Canadian jurisdiction
- `annual-return/` — 14 files: one per Canadian jurisdiction
- `minute-books/` — 14 files: one per Canadian jurisdiction
- `incorporation/` — 14 files: one per Canadian jurisdiction
- `articles/` — 13 files: QuickBooks Online articles (one per province, no Federal article exists on the live site)

## File format

Each `.md` file has YAML frontmatter (`title`, `source_url`, `slug`, `section`) followed by an H1 and the page body. The `source_url` always points to the live `.html` page on bizfile.ca — handy for re-scraping or fact-checking as you edit.

## Notes on content

- Files corresponding to pages that were directly scraped contain the live body text verbatim, with paragraph breaks restored.
- Per-jurisdiction pages (profile-reports / good-standing / annual-return / minute-books / incorporation) follow the live site's template-driven copy — the jurisdiction name, registry, governing Act, and fees vary; the structure is identical.
- `annual-return/Canada-federal-corporate-annual-return.md` corresponds to a URL that is broken on the live site (returns 404). The content is templated to the same pattern as the provincial files.
- The 13 QuickBooks articles follow a templated structure on the live site; jurisdiction-specific details vary.
