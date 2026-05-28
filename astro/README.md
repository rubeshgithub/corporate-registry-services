# Corporate Registry Services (CRS) — Astro site

An Astro static site that consumes the 92 markdown files in `../content/` and renders them under the CRS brand.

## Quick start

```bash
cd astro
npm install
npm run dev      # local dev server at http://localhost:4321
npm run build    # production build to ./dist
npm run preview  # preview the built site
```

## Project layout

```
astro/
├── src/
│   ├── content/config.ts        # Astro content collection definitions (reads ../content)
│   ├── layouts/BaseLayout.astro # HTML shell, <head>, header, footer
│   ├── components/
│   │   ├── Header.astro         # Sticky nav with CRS brand mark
│   │   ├── Footer.astro         # Footer with service / company links
│   │   ├── SectionIndex.astro   # Card-grid index for any section
│   │   └── PageDetail.astro     # Article-style renderer for any .md
│   ├── pages/
│   │   ├── index.astro          # Homepage (hero + service grid + value props)
│   │   ├── about.astro
│   │   ├── contact.astro
│   │   ├── profile-reports/
│   │   ├── good-standing/
│   │   ├── annual-return/
│   │   ├── minute-books/
│   │   ├── incorporation/
│   │   └── articles/
│   └── styles/global.css        # CRS brand tokens + base styles
├── public/favicon.svg
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Brand tokens (change once, re-skin everything)

All colours, fonts, spacing live as CSS variables in `src/styles/global.css`:

```css
--crs-primary:   #0F2A4A;   /* deep navy */
--crs-accent:    #C8A65D;   /* warm gold */
--crs-bg:        #FAFAF7;
--crs-text:      #1A1A1A;
--crs-font-sans: 'Inter', ...
--crs-font-serif:'Source Serif Pro', Georgia, serif;
```

Update the values and the entire site re-skins. The brand name "CRS" / "Corporate Registry Services" appears in `Header.astro`, `Footer.astro`, `BaseLayout.astro`, `package.json`, `astro.config.mjs` and the homepage.

## How content flows

1. Markdown files live in `../content/<section>/<slug>.md`.
2. `src/content/config.ts` declares one Astro collection per section (`core`, `profile-reports`, `good-standing`, `annual-return`, `minute-books`, `incorporation`, `articles`) using the `glob()` loader pointed at `../content/<section>`.
3. Each section's `index.astro` calls `getCollection('<section>')` and renders the cards.
4. Each section's `[...slug].astro` generates one HTML page per markdown file at build time.

To add a page: drop a new `.md` into the right `../content/<section>/` folder with the same frontmatter shape. Astro picks it up automatically.

## Using this project with Claude Code in VS Code

This project is designed to be edited with Claude Code. Suggested workflow:

1. **Open the workspace folder** (`CorporateRegistryServices/`) in VS Code so Claude Code can see both `content/` and `astro/`.
2. **Install Claude Code** if you haven't already — see https://docs.claude.com.
3. **Initialise a CLAUDE.md** in the repo root (Claude Code's `/init` command writes one) so every future Claude Code session has context.

### Useful Claude Code prompts

Copy-paste these into Claude Code to evolve the site:

- **"Rewrite all 14 markdown files in `content/profile-reports/` to remove every reference to the original bizfile.ca brand and replace it with CRS messaging."**
- **"Add a hero CTA on each per-jurisdiction page that links to a province-specific Stripe checkout — read the price from frontmatter (`price` field) and add `price: 60` to each MD's frontmatter."**
- **"Generate a sitemap.xml at build time covering every entry in every collection. Use `@astrojs/sitemap`."**
- **"Add SEO: per-page `<meta property="og:image">`, `<meta name="twitter:card">`, and a JSON-LD `Service` schema block on each section detail page."**
- **"Write Astro middleware that redirects every legacy bizfile.ca URL (`/Ontario-corporate-profile-report.html`) to the new CRS URL (`/profile-reports/Ontario-corporate-profile-report`). Use `_redirects` for Netlify or `astro.config.mjs` redirects for Vercel."**
- **"Add a Pricing comparison table component that pulls fees from each MD's frontmatter and renders a sortable table on the homepage."**

### Things to do before going live

- [ ] Add a real domain in `astro.config.mjs` (`site:` field).
- [ ] Replace placeholder contact info in `src/pages/contact.astro`.
- [ ] Wire the contact form to Netlify Forms, Formspree, or a serverless function.
- [ ] Audit all 92 markdown files for any leftover "BizFile" references and replace with "CRS".
- [ ] Add per-page meta descriptions (currently using a single site-wide default).
- [ ] Generate / source a real logo and favicon. The current SVG favicon is a placeholder.
- [ ] Add legal pages: Privacy Policy, Terms of Service, Refund Policy.
- [ ] Set up CI: GitHub Actions to run `astro build` on every push.

## Hosting

The site is a pure static build (`dist/`), deployable to:

- **Cloudflare Pages** — connect the repo, set build command `npm run build`, output `astro/dist`.
- **Netlify** — same, set base directory `astro`.
- **Vercel** — same, framework preset auto-detects Astro.
- **GitHub Pages** — `npm run build` then deploy `dist/` via `peaceiris/actions-gh-pages` or similar.

No server required.

## License

Copyright © Corporate Registry Services. All rights reserved.
