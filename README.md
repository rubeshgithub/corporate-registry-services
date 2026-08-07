# Corporate Registry Services (CRS)

Two things live in this repo:

1. **`web/`** — the public Next.js site at [corporateregistryservices.ca](https://www.corporateregistryservices.ca) (order flows, articles, admin analytics, CMS, outreach). Deploys to Render.
2. **`scripts/`** — the Alberta / Saskatchewan registrar data pipeline that ingests corporate events into MongoDB Atlas (`crs.events`, `crs.companies`). Powers `/canada-corporations-search`, the company-profile pages, and the outreach lists.

The Astro version is gone. The site is Next.js 16 on the App Router.

---

## Repo layout

```
CorporateRegistryServices/
├── web/                                # Next.js 16 site (deploys to Render)
├── content/                            # 90+ markdown files — SEO articles, guides, jurisdiction pages
├── scripts/                            # Registrar pipeline (Node + Python)
├── automation/                         # GSC opportunities queue, draft relay, misc jobs
├── crs-content/                        # NFP-cluster content + SEO strategy notes
├── minutebook-seo-content/             # MinuteBook standalone SEO content
├── tests/                              # Pipeline / parser tests
├── data/                               # ★ GITIGNORED — 200MB+ registrar archive + delta CSVs + PIPELINE-STATUS.md
├── ALBERTA-REGISTRY-DATA-PIPELINE.md   # Pipeline handoff doc — start here for the pipeline
└── README.md                           # (this file)
```

Two directories are **git-ignored on purpose:**

- `data/` — 200 MB+ of raw `.cfm` files, delta CSVs, and the running `PIPELINE-STATUS.md`. Regenerate from source (Alberta King's Printer + Saskatchewan Gazette) on any new machine — see below.
- `web/.env.local`, `web/.env` — secrets (Mongo URI, Stripe, SES, Infobip, Places, Infobip). Restore from your password manager.

---

## Cold-start on a new machine

### Prereqs

- **Node** 20+ (for `web/` and `scripts/*.mjs`)
- **Python** 3.10+ (for `scripts/*.py`)
- **git**
- Access to the MongoDB Atlas cluster the site uses (URI in your password manager)

### Steps

```bash
# 1. Clone
git clone https://github.com/rubeshgithub/corporate-registry-services.git
cd corporate-registry-services

# 2. Web app
cd web
npm install
# Create web/.env.local (see "Env vars needed" below)
npm run dev          # http://localhost:3000
cd ..

# 3. Pipeline (Node side — MongoDB driver only)
cd scripts
npm install          # installs `mongodb`
cd ..

# 4. Pipeline (Python side — no requirements.txt, install manually)
pip install requests beautifulsoup4 pdfplumber   # pdfplumber only needed for SK gazette parser
```

### Env vars needed in `web/.env.local`

Everything is gitignored — you'll need to restore these from your password manager:

| Var | Used by | Notes |
|---|---|---|
| `MONGODB_URI` | web app + all `scripts/*.mjs` | Atlas SRV URI. Script uses `DB_NAME=crs` regardless of path. |
| `STRIPE_SECRET_KEY` | order flows + `/api/order/webhook` | |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` | SES (all order + contact emails) | |
| `SES_FROM`, `NOTIFY_EMAIL` | SES sender + owner inbox | |
| `INFOBIP_API_KEY`, `INFOBIP_NUMBER`, `SMS_ALERT_TO_NUMBER` | SMS alerts on paid orders + order-page arrivals | Optional (`SMS_ENABLED=0` to disable) |
| `GOOGLE_PLACES_API_KEY` + `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` | address autocomplete + company enrichment | |
| `ADMIN_PASSWORD` | `/admin/*` gate | |
| `HOST` | Places-API domain restriction | |

The pipeline scripts read `MONGODB_URI` from `process.env` directly — they don't auto-load `.env.local`. In PowerShell:

```powershell
$env:MONGODB_URI = "mongodb+srv://…"
node scripts/import_registrar.mjs --file data/registrar/2026/14_Jul31_Registrar.cfm --merge-shells
```

Or one-shot: `$env:MONGODB_URI="…"; node scripts/…`

---

## The two workflows

### A. Web app development

```bash
cd web
npm run dev          # dev server at :3000
npm run build        # production build + type-check + static gen
npm start            # serve the production build
```

Every code change goes through git → auto-deploys to Render on push to `main`. Content changes to `content/*.md` also trigger a Render redeploy (content is read at build time).

### B. Registrar pipeline (recurring, every ~2 weeks)

The Alberta Registrar's Periodical is published **on the 15th and last day of each month** at Alberta King's Printer. Each new issue = a delta ingest:

```bash
# 1. Download any missing issues (resume-safe; skips existing files)
python scripts/download_registrar_archive.py --from 2026 --to 2026

# 2. (Optional) Parse the new issue into a dated delta CSV — sanity-check counts
python scripts/make_delta.py --file data/registrar/2026/NN_MonDD_Registrar.cfm

# 3. Ingest into Atlas (idempotent — safe to re-run)
$env:MONGODB_URI = "mongodb+srv://…"
node scripts/import_registrar.mjs --file data/registrar/2026/NN_MonDD_Registrar.cfm --merge-shells

# 4. Live check on prod
curl "https://www.corporateregistryservices.ca/api/company-search?q=<distinctive+new+corp>&province=ab"

# 5. Update data/PIPELINE-STATUS.md with a new dated entry
```

Expected profile per issue: ~3,000–4,000 events / ~3,000–4,000 company upserts / a handful of shell merges / 0 duplicates / 0 errors / ~200–250 s on Atlas.

**Full operational context:** [`ALBERTA-REGISTRY-DATA-PIPELINE.md`](ALBERTA-REGISTRY-DATA-PIPELINE.md) — read this first before touching the pipeline. It covers all 7 notice sections, the parser edge cases, the DB schema, the outreach lists, and the SK gazette backfill.

**Latest run log:** `data/PIPELINE-STATUS.md` (local — gitignored). Written to on every ingest; carries forward across machines by copying manually.

**Known parser quirk:** the Node `.cfm` parser (in `import_registrar.mjs`) sees ~200 more events per issue than the Python `make_delta.py` — concentrated in the registrations bucket. Delta CSV is a preflight estimate; the ingest count is the source of truth.

---

## Content workflow

- **`content/`** — SEO articles and jurisdiction pages. Edit the markdown; Next.js reads it at build time via `web/src/lib/content.ts`. Sections: `annual-return`, `good-standing`, `incorporation`, `minute-books`, `profile-reports`, `articles`, `guides`, `not-for-profit`, `nfp-grants`.
- **`crs-content/`** — NFP cluster content pipeline (not yet promoted into `content/`). Has its own README + SEO strategy notes.
- **`automation/gsc/opportunities.json`** — Google Search Console keyword opportunities queue; drives which articles to prioritize.
- **`minutebook-seo-content/`** — MinuteBook (separate product) SEO content in this monorepo temporarily.

Push a content change → Render redeploys → new page live in ~2 min. No DB writes involved.

---

## Where else things live

| Concern | Location |
|---|---|
| Admin analytics dashboard | `/admin/analytics` in the running app (password-gated) |
| Order flows (all quote + Stripe flows) | `web/src/app/order/*` + `web/src/components/order/*` |
| Article search islands (CORES, PEI, corporate documents, etc.) | `web/src/components/*Island.tsx` + `web/src/app/[section]/[slug]/page.tsx` |
| CMS (article editing + publishing) | `/cms` in the running app |
| Outreach (email/SMS to enriched leads) | `web/src/app/admin/outreach/` + `scripts/enrich_contacts.mjs` |
| Persistent memory (Claude assistant) | `~/.claude/projects/c--Users-user-Documents-minutebook/memory/` |

---

## Deploy

- **Web app** — Render, auto-deploys on push to `main`. Env vars set in Render dashboard (mirror of `web/.env.local`).
- **Pipeline** — runs locally on demand (no scheduled task in prod). See §B above.
