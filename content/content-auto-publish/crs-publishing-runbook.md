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

## GSC data + opportunity queue (read ALL THREE every run)

The repo contains two daily-synced files under `automation/gsc/`, plus a human-curated seed store under `automation/seeds/`:

**`opportunities.json` — READ THIS FIRST.** A ranked queue of the top-30 SEO opportunities as of the last GSC pull. Each row is a query where CRS already shows in Google (≥5 impressions in the last 28 days) but ranks at position 15–60 AND no existing URL semantically matches. Fields: `query`, `impressions`, `position`, `clicks`, `score` (impressions × position-gap), `suggested_slug`, `suggested_section`. **This file complements the manual queue below — the queue wins while it has Pending items.** Reason: the matcher scores single queries, so it structurally underestimates demand spread across phrasing variants (e.g. "incorporate in nova scotia" totals ~340 impressions/28d across 10 variants, none of which individually outranks the top single-query opportunity at ~21). Use opportunities.json to: (a) sanity-check the next queue item against fresh data; (b) flag in your report any opportunity that clearly beats the next queue item — but still deliver the queue item unless the user has redirected; (c) REPLENISH the queue when it has no Pending items: promote the top opportunities as new Pending rows, aggregating related query variants into one target, and rejecting any whose suggested_slug semantically duplicates an existing URL (e.g. "canada business registry search" is /canada-corporations-search re-worded — a title/content refresh of that page beats a new article; deliver refresh recommendations to the user instead).

**`latest.json` — the raw 28-day export.** Use for movement reporting and drill-downs: how previously delivered articles are ranking, position changes on top pages, page×query breakdown of a specific slug.

**`automation/seeds/` — the human's own ideas. Nothing generates these; do not overwrite them.** `inbox.txt` is where the site owner pastes URLs of pages that attract the clients he wants (one per line, optional `-- note` after the URL). `seeds.json` is the triaged store. GSC can only surface demand CRS is *already* ranking for; seeds are how the owner injects demand it isn't ranking for at all, so they carry business judgment that no score can reproduce and they **outrank `opportunities.json`** whenever the queue needs replenishing.

**Draining the inbox (do this every run, before picking an article):** for each non-comment line in `inbox.txt`, fetch the URL, then append a seed object to `seeds.json` with `id`, `added`, `source_url`, `user_note`, `signal_type` (`intent` = proves buyers want something, `competitor` = ranks for a query CRS should own), `what_the_page_is` (factual summary), `crs_angle`, `priority`, `status`, `resolution`, `duplicate_check`, `editorial_caution`. Then remove the drained lines from `inbox.txt` and commit both files with the run. Triage rules:
- **A seed is an intent signal, not a template.** Never rewrite the source page. Find the commercial angle that connects the buyer's need to a service CRS actually sells, and be explicit in `editorial_caution` about what CRS must not claim (especially for government-service pages — CRS is a registry agent, not a tax, legal or licensing authority).
- **Duplicate check is mandatory** against the internal-link inventory, `latest.json` page rows, and the existing queue. If it overlaps, set `status: "merged"` and fold the angle into the existing queue item or into a refresh of the existing page — a thin near-duplicate costs rankings on the page that already exists.
- **If there is no honest CRS angle, reject it** (`status: "rejected"` with a one-line reason) and say so in your report. Do not manufacture a tenuous link to sell a service.
- Newly queued seeds go in as Pending rows at the END of the queue unless `priority` is `"next"`, in which case they go directly after the current in-flight item.

Steps each run:
1. Report movement to the user from `latest.json` — previously delivered article positions, notable movers, any regressions.
2. Drain `automation/seeds/inbox.txt` per the triage rules above; report what was seeded, merged or rejected.
3. Pick the first Pending item from the "Article queue" table below. If the queue has no Pending items, replenish it — **seeds with `status: "new"`/`"queued"` first, then `opportunities.json`** per the policy above — always verifying the `suggested_slug` doesn't collide with or semantically duplicate an existing URL (check `latest.json`'s `page` rows and the internal-link inventory).
4. Write, post, log in the queue table below.

If the GSC files are absent, proceed from the queue table using the July 2026 data baked in — but note this in your report so the user can investigate the sync workflow.

## Article queue (GSC-data-driven plan v2, July 2026)

| Week | Slug | Target keyword | Notes | Status |
|---|---|---|---|---|
| 1 | what-is-cores-alberta | cores alberta | Relayed 2026-07-27; confirmed live per GSC 2026-08-04 (pos ~9.3, 236 imp/28d) | PUBLISHED (live at /articles/what-is-cores-alberta) |
| 1b | (refresh, manual) | alberta annual return | New title/description + faq front-matter block delivered to user — user applies manually | With user |
| 2 | how-to-incorporate-in-nova-scotia | incorporate in nova scotia | ~80 imp/wk across 10 variants; NS service page ranks 40–58. Link to NS incorporation service page + /order/ flow. NOTE: article uses govt-verified $118.35 RJSC annual renewal fee — existing NS annual-return article says $25; discrepancy flagged to user 2026-08-01 | PUBLISHED 2026-08-01 (live at /articles/how-to-incorporate-in-nova-scotia) |
| 3 | (refresh pass, manual) | CTR titles/metas top-10 pages | Recommendations doc delivered to user 2026-08-04 (crs-ctr-refresh-recommendations.md): 10 pages, priority-ranked; PEI + BC + /canada-corporations-search are the top wins; guides/annual-return-filing-deadlines-canada missing meta description; cores-alberta cannibalization watch flagged | With user |
| 4 | (expand existing) | ontario annual return | Expanded replacement article (~700→1,750 words) delivered to user 2026-08-07 (crs-ontario-annual-return-expansion.md): adds AIR/2021-change, company-key, initial-return-vs-notice-of-change, dissolution sections + faq block. **Corrects two live errors: OBR annual return has NO govt fee (article said $22) and ONe-key is retired (now ServiceOntario account + company key)** — user to verify $0 fee on ontario.ca once and apply manually | With user (delivered 2026-08-07) |
| 5 | digital-minute-books-canada | virtual minute book / digital minute book | Published 2026-08-05 (user relayed manually — session git push was blocked); funnels to /minute-books/digital-minute-book-canada | PUBLISHED (live at /articles/digital-minute-books-canada) |
| 6 | how-to-incorporate-in-saskatchewan | saskatchewan incorporation | Relayed 2026-08-10. Fees govt-verified (ISC table eff. 2026-04-15): incorporation $255, name res $50, AR $60/$110 late. "ISC in title" refresh note: already present on live SK annual-return article — no action. **THREE live-content errors found 2026-08-10, user to fix:** (1) /incorporation/saskatchewan-incorporation-service FAQ claims 25% Canadian-resident director rule — repealed by the SBCA 2021 (in force 2023-03-12), now none (SK attorney via POA required if no SK-resident director/officer); (2) live SK annual-return article says $45 govt fee — ISC table says $60 on-time/$110 late; (3) same article says due "within 3 months of anniversary" — ISC says due one month after incorporation anniversary | PUBLISHED 2026-08-12 (live at /articles/how-to-incorporate-in-saskatchewan; CMS publish commit 9158ab7). Three live-content errors above still open |
| 7+ | certificate-of-status-ontario | certificate of status ontario | SERP-verified weak competition. **Must open with seed-001:** the two proofs Ontario buyers confuse — Tax Compliance Verification (TCV number, Ontario Ministry of Finance, free, needs a CRA FBC letter) vs. Certificate of Status (registry standing, what CRS supplies). Cite ontario.ca; never imply CRS obtains a TCV or FBC. Add an FAQ pair on the distinction. Written per seed-001: opens with TCV-vs-status, 2 FAQ items on the distinction, govt fee verified $26 (form 5310E instruction, King's Printer 2024); CTA → /order/good-standing | Relayed 2026-08-13 (draft in CMS review queue) |
| 8+ | cost-to-incorporate-in-ontario | how much does it cost to incorporate in ontario | From v1 plan | Pending |

## After posting

1. Update the Status column in this doc (commit the updated file back to the repo at `content/content-auto-publish/crs-publishing-runbook.md` in the same push as the draft), and update any seed's `status` in `automation/seeds/seeds.json` that this run acted on.
2. Report to the user: which article, response status, draft URL, reminder to review.
3. If the queue is empty: check for a fresh GSC export from the user; otherwise report queue exhausted and propose next candidates from the province × service matrix.
