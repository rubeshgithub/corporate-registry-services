# CRS Auto-Publishing Runbook (for scheduled sessions)

This doc drives the scheduled article-publishing task for corporateregistryservices.ca (CRS). A fresh session reads this, writes the NEXT unpublished article in the queue, POSTs it to the CRS publish API, then updates the Status column below by rewriting this doc.

## Article file format (EXACT — matches the site's markdown pipeline)

Articles are markdown files with YAML front-matter. The site generates FAQ JSON-LD from the structured `faq:` block. Follow this shape precisely:

```yaml
---
title: "SEO title ≤60 chars, keyword near front"        # becomes <title>
h1: "On-page H1 (may differ slightly from title)"
slug: "kebab-case-slug"
section: "articles"
description: "Meta description ≤155 chars with keyword + benefit"
faq:
  - q: "Question exactly as in body?"
    a: "2-3 sentence answer."
---
```

Body: markdown, starts with a bold CTA line ("**Deadline coming up?** [action →](/order/...)"), then answer-first intro, question-form H2s, relative internal links, CTA section at the end with Turnaround/Price lines. No H1 in the body (front-matter h1 handles it). CTA links use /order/... or /file-annual-return/... paths, optionally with ?src=article-<slug> tracking.

## How to write each article

Use the `seo-content-engine` skill (Stage 4) if available. Core rules: ≥3 question-form H2s; answer-first intro; 1,200–2,000 words; concrete numbers labeled as typical/estimates unless sourced; verify government fees/deadlines/portal names with web search before writing; internal links ONLY to real CRS pages (below); never invent URLs.

**Brand voice:** professional, plain-spoken, benefit-led, urgency around deadlines. Short punchy claims with concrete numbers: "$99 all-in + GST", "24 hours from order", "no CORES account required", "Beat your 1-month deadline."

**Consistent CRS facts (from live articles):** Alberta annual return $47 govt fee / due within 1 month of anniversary; BC Annual Report $43 / 2 months; Federal CBCA $12 / 60 days after anniversary month; CRS all-in price $99 + tax for annual filings, 24h turnaround; director/shareholder resolution sets $79 + GST, 1 business day; By-Law No. 1 drafting $99 + GST; minute book Standard package $299. CRS is a Certified CORES Registry Agent. Alberta & BC: no director residency requirement; Federal CBCA: 25% of directors must be Canadian residents.

## Internal-link inventory (real pages, expanded from actual article files)

Order/service: /order/annual-return · /order/bylaws · /order/director-resolution · /file-annual-return/alberta · /annual-return · /minute-books/digital-minute-book-canada · /incorporation · /canada-corporations-search · /good-standing · /minute-books · /contact
Guides: /guides/annual-return-filing-deadlines-canada · /guides/corporate-profile-report-vs-certificate-of-good-standing · /guides/federal-vs-provincial-incorporation-canada · /guides/nuans-name-search-canada-guide · /guides/what-is-a-certificate-of-good-standing-canada · /guides/what-is-a-corporate-minute-book-canada · /guides/how-to-verify-a-canadian-company
Articles: /articles/how-to-file-your-annual-return-in-alberta · .../how-to-file-your-annual-return-in-british-columbia · .../How-to-File-Your-Annual-Return-Federal-Canada (note: capitalized slug!) · .../how-to-file-your-annual-return-in-saskatchewan · .../how-to-file-your-annual-return-in-ontario · .../how-to-file-your-annual-return-in-nova-scotia · .../how-to-file-your-annual-return-in-new-brunswick · .../shareholder-resolutions-in-canada · .../director-resolutions-in-canada · .../share-certificates-in-canada · .../corporate-by-laws-canada · .../what-is-cores-alberta (Week 1, pending publish) · .../where-corporate-documents-belong-minute-book-canada

## Publish API — the CMS's own API (verified live 2026-07-27; 401 on unauth confirmed)

Base: `https://www.corporateregistryservices.ca` · Auth: `Authorization: Bearer <CMS_API_TOKEN>` (token location: see "Token" note below). The API can only create/read/update DRAFTS — publish and delete are human-only (cookie auth in the CMS UI). Full brief lives with the site operator (CMS API BRIEF, 2026-07-27).

**Payload for POST /api/cms/articles** (also PUT /api/cms/articles/{id} with any subset):
```json
{
  "section": "articles",            // enum: articles, guides, annual-return, incorporation, minute-books, good-standing, profile-reports, not-for-profit, nfp-grants
  "slug": "kebab-case",             // unique within section; ≤200 chars
  "title": "≤70 chars",
  "h1": "optional; null → title used",
  "description": "≤165 chars",
  "body": "GitHub-flavoured markdown, ≥300 chars, NO <script> tags, NO front-matter (fields above replace it)",
  "faq": [ { "q": "...", "a": "..." } ]   // becomes FAQ JSON-LD
}
```

**Idempotent flow (follow exactly):**
1. `GET /api/cms/articles?slug=<slug>&section=<section>` (this also serves as the health check — 200 with an articles array means API+auth+DB are healthy)
2. Match with `status:"published"` → log "already published — skipping", move to next queue item
3. Match with `status:"draft"` → `PUT /api/cms/articles/{id}` with new content → log "updated existing draft"
4. No match → `POST /api/cms/articles` → 201 = created; on 409 GET-then-PUT; on 422 log validation problems and do NOT retry same body
5. Errors: 401 → token problem, stop and tell the user; 500 → alert user; 502 → retry with backoff (max 2)

After a successful POST/PUT: the draft appears at /cms (Status=Draft); the human previews at /cms/preview/{id} and clicks Publish, which commits content/{section}/{slug}.md to main → auto-deploy → live at /{section}/{slug}. The automation NEVER publishes.

**Delivery mechanism (VERIFIED WORKING 2026-07-27 — follow exactly):** direct HTTPS to corporateregistryservices.ca is blocked from this environment, and the GitHub REST API is proxied. Use plain git instead: clone `https://github.com/rubeshgithub/corporate-registry-services.git` (shallow), write the payload as `automation/drafts/<slug>.json`, commit, and push to main using `https://rubeshgithub:<PAT>@github.com/rubeshgithub/corporate-registry-services.git` (username:token auth form — `x-access-token:` is rejected). The repo's relay Action then POSTs it to the CMS API; confirm success by fetching origin/main after ~2 minutes and seeing the "chore: relay automation drafts to CMS [skip ci]" cleanup commit with the JSON removed. The draft then appears in the /cms review queue. Payload JSON = the fields in the block above (section, slug, title, h1, description, body WITHOUT front-matter, faq array).

**Credentials (project docs):** `claude/crs-github-pat.md` = GitHub PAT + repo + exact git commands; `claude/crs-cms-token.md` = CMS bearer token (used only by the GitHub Action — sessions never call the CMS directly). If the PAT doc is missing or the push fails twice, save the payload JSON to the workspace, deliver it to the user with SendUserFile and an explanation, and stop. Queue items marked "(manual)" are refresh/recommendation docs — deliver those to the user as files, not via the relay.

**Converting queue articles to API payloads:** take the article's front-matter fields (title/h1/slug/section/description/faq) as the JSON fields, and the markdown body WITHOUT the front-matter block as `body`. Strip any bold CTA image-comment blocks that reference nonexistent assets.

## GSC data + opportunity queue (read BOTH every run)

The repo contains two daily-synced files under `automation/gsc/`:

**`opportunities.json` — READ THIS FIRST.** A ranked queue of the top-30 SEO opportunities as of the last GSC pull. Each row is a query where CRS already shows in Google (≥5 impressions in the last 28 days) but ranks at position 15–60 AND no existing URL semantically matches. Fields: `query`, `impressions`, `position`, `clicks`, `score` (impressions × position-gap), `suggested_slug`, `suggested_section`. **This file supersedes the manual queue below** — pick the top-ranked opportunity that hasn't been published yet, unless the user has explicitly directed otherwise.

**`latest.json` — the raw 28-day export.** Use for movement reporting and drill-downs: how previously delivered articles are ranking, position changes on top pages, page×query breakdown of a specific slug.

Steps each run:
1. Report movement to the user from `latest.json` — previously delivered article positions, notable movers, any regressions.
2. Pick the next article from `opportunities.json` top-3, skipping anything already in the "Article queue" table below marked DELIVERED. Verify the `suggested_slug` doesn't collide with an existing published URL by checking `latest.json`'s `page` rows first.
3. Write, post, log in the queue table below.

If both files are absent, proceed from the queue table using the July 2026 data baked in — but note this in your report so the user can investigate the sync workflow.

## Article queue (GSC-data-driven plan v2, July 2026)

| Week | Slug | Target keyword | Notes | Status |
|---|---|---|---|---|
| 1 | what-is-cores-alberta | cores alberta | Relayed via GitHub Action 2026-07-27; in /cms review queue | DELIVERED — awaiting human publish |
| 1b | (refresh, manual) | alberta annual return | New title/description + faq front-matter block delivered to user — user applies manually | With user |
| 2 | how-to-incorporate-in-nova-scotia | incorporate in nova scotia | ~80 imp/wk across 10 variants; NS service page ranks 40–58. Link to NS incorporation service page + /order/ flow | Pending |
| 3 | (refresh pass, manual) | CTR titles/metas top-10 pages | Deliver recommendations doc to user, not API | Pending |
| 4 | (expand existing) | ontario annual return | Expand ON article (pos 28.9, 130 imp/wk); deliver as refresh doc | Pending |
| 5 | digital-minute-books-canada | virtual minute book / digital minute book | NOTE: /minute-books/digital-minute-book-canada service page exists — article should target the informational query and funnel to it, not duplicate it | Pending |
| 6 | how-to-incorporate-in-saskatchewan | saskatchewan incorporation | Same template as NS; also add "ISC" to Sask annual-return article title (refresh note) | Pending |
| 7+ | certificate-of-status-ontario | certificate of status ontario | SERP-verified weak competition | Pending |
| 8+ | cost-to-incorporate-in-ontario | how much does it cost to incorporate in ontario | From v1 plan | Pending |

## After posting

1. Update the Status column in this doc (project_write the full updated doc back to the same path).
2. Report to the user: which article, response status, draft URL, reminder to review.
3. If the queue is empty: check for a fresh GSC export from the user; otherwise report queue exhausted and propose next candidates from the province × service matrix.
