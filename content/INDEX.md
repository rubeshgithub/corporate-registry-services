# CRS Content Index

Markdown source for the CRS marketing site. Rendered by `web/src/app/[section]/[slug]/page.tsx` via `web/src/lib/content.ts`.

## Folders

- `annual-return/` — 14 files: one per Canadian jurisdiction (federal + 13 provinces/territories)
- `articles/` — how-to and educational articles (per-jurisdiction annual return guides + more)
- `good-standing/` — 14 files: one per Canadian jurisdiction
- `guides/` — evergreen explainer content shared across services
- `incorporation/` — 14 files: one per Canadian jurisdiction
- `minute-books/` — 14 files: one per Canadian jurisdiction
- `profile-reports/` — 14 files: one per Canadian jurisdiction

## File format

Each `.md` file has YAML frontmatter followed by the page body:

```yaml
---
title: "Alberta Annual Return: How to File with Alberta Corporate Registry — $99 All-In"
slug: "How-to-File-Your-Annual-Return-in-Alberta"
section: "articles"
description: "Meta description used by generateMetadata(). Falls back to first paragraph if omitted."
---
```

- `title` — page H1 and `<title>` prefix
- `slug` — must match the filename (without `.md`); routing is case-insensitive and lowercased
- `section` — must be one of the `SECTIONS` constants in `content.ts`
- `description` (optional) — meta description; if absent, first paragraph is used as a fallback

## Pricing

The single source of truth for CRS pricing is [`web/src/lib/service-config.ts`](../web/src/lib/service-config.ts). If a content page names a price, it must match. Government fees are always bundled into the all-in CRS price — never advertise them separately.
