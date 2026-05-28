# Corporate Registry Services (CRS)

Marketing + content site for **Corporate Registry Services**, a Canadian corporate filings and registry-services brand. Content was sourced from a reference site (bizfile.ca) and re-branded; the new site is built with Astro.

## Repository layout

```
CorporateRegistryServices/
├── content/        # 92 markdown files — the source of truth for all page copy
│   ├── core/                 (9 files: home, about, contact, articles hub + 4 service hubs)
│   ├── profile-reports/      (14 files)
│   ├── good-standing/        (14 files)
│   ├── annual-return/        (14 files)
│   ├── minute-books/         (14 files)
│   ├── incorporation/        (14 files)
│   ├── articles/             (13 files)
│   └── INDEX.md              (overview of the content tree)
└── astro/          # Astro static site that renders content/ as a real website
    ├── src/
    ├── public/
    ├── package.json
    └── README.md   # Astro project README (build, deploy, prompts)
```

## Two-track workflow

- **Edit `content/`** when you want to change *what* the site says (copy, prices, offerings).
- **Edit `astro/src/`** when you want to change *how* the site looks or behaves (layout, components, brand tokens, navigation).

The Astro project reads `content/` at build time — you do not duplicate copy between the two folders.

## Quick start

```bash
cd astro
npm install
npm run dev      # http://localhost:4321
npm run build    # produces astro/dist
```

See [`astro/README.md`](astro/README.md) for full project details, brand tokens, and a Claude-Code-in-VS-Code prompt playbook.

## Brand

- **Name:** Corporate Registry Services
- **Short form:** CRS
- **Palette:** Deep navy + warm gold + off-white (defined as CSS variables in `astro/src/styles/global.css`)

To re-skin: change the CSS variables at the top of `global.css`. Brand-name strings live in `Header.astro`, `Footer.astro`, `package.json`, the homepage, and the `<title>` template in `BaseLayout.astro`.
