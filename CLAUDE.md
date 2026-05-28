# Claude Code project notes — Corporate Registry Services

## What this repo is

A two-track project for the **Corporate Registry Services (CRS)** brand:

- `content/` — 92 markdown files holding every page's copy. Source of truth for content.
- `astro/` — Astro static-site project that compiles those 92 files into a real website.

Content lives outside the Astro project on purpose, so the same `.md` corpus could later feed a CMS, a search index, or a second site.

## How to add or edit a page

- **Change copy** → edit the relevant file in `content/<section>/<slug>.md`. The Astro build picks it up on next `npm run build` or hot-reloads in `npm run dev`.
- **Add a page** → drop a new `.md` into `content/<section>/` with the same frontmatter shape:
  ```yaml
  ---
  title: "..."
  source_url: "https://..."   # optional
  slug: "..."                  # must match the filename without .md
  section: "<folder name>"
  ---
  ```
  Astro will route it automatically at `/<section>/<slug>`.

## How to re-skin

- All CRS brand tokens (colours, fonts, spacing) live in `astro/src/styles/global.css` as CSS variables prefixed `--crs-*`.
- Brand-name strings ("CRS" / "Corporate Registry Services") appear in:
  - `astro/src/components/Header.astro`
  - `astro/src/components/Footer.astro`
  - `astro/src/layouts/BaseLayout.astro`
  - `astro/src/pages/index.astro`
  - `astro/package.json` (`name`, `description`)
  - `astro/astro.config.mjs` (`site:`)
  - `astro/public/favicon.svg`
  - Top-level `README.md`

To rebrand to a different company, find-and-replace those strings + update the CSS variables.

## Project conventions

- **Sections** are flat: `profile-reports`, `good-standing`, `annual-return`, `minute-books`, `incorporation`, `articles`, plus `core` for top-level pages.
- **Slugs** match filenames exactly (1:1 with the original bizfile.ca URL paths).
- **Federal pages** are listed first in each section index; the rest are alphabetical.
- **Frontmatter** is validated by Zod in `astro/src/content/config.ts`. Missing required fields fail the build.

## Known issues to clean up before going live

- Several `content/` files still reference "BizFile" in the body — search and replace with "CRS" or "Corporate Registry Services".
- Pricing inconsistencies were inherited from the source: e.g., Annual Return appears as both $14.99 and $49.99 across files. Pick one and propagate.
- The contact form in `astro/src/pages/contact.astro` is a static stub — needs a form handler (Netlify Forms, Formspree, or serverless function).
- Placeholder contact info (address, email, phone) needs to be replaced.
- Several spelling errors in the source content ("Fedederal", "Norder Now") need correcting.

## Useful one-liners

```bash
# Count files per section
find content -name "*.md" | awk -F/ '{print $2}' | sort | uniq -c

# Find any leftover BizFile references
grep -ri "bizfile" content/

# Dev server with verbose logs
cd astro && npm run dev -- --verbose

# Production build
cd astro && npm run build && ls -la dist/
```
