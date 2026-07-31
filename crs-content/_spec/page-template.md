# CRS Content Spec — Not-for-Profit Clusters (read fully before writing any page)

## Brand
- Company: **Corporate Registry Services (CRS)**, operating **BizFile Canada** — bizfile.ca. Canada-wide corporate search & filing service (profile reports, certificates of good standing, annual returns, minute books, incorporations) covering federal + all 13 provinces/territories.
- Tone: professional yet accessible; fast, reliable, compliance-focused ("Fast. Reliable. Official."). Reassuring, plain-English explanations of legal/registry processes. No hype, no invented statistics.
- Audience: founders of community organizations, sports clubs, cultural associations, religious groups, professional associations, prospective charities — mostly first-time incorporators.

## Global writing rules
1. Every factual claim (act names, minimum director counts, fees, residency rules, program amounts, deadlines) MUST be verified against an official government source you actually fetched or saw in live search results TODAY. Never invent or guess URLs — only link URLs you have seen returned by search or fetch.
2. Prefer official sources: canada.ca, ised-isde.canada.ca, ontario.ca, gov.bc.ca, alberta.ca, publications.saskatchewan.ca, gov.mb.ca, quebec.ca / registreentreprises.gouv.qc.ca, novascotia.ca / beta.novascotia.ca, gnb.ca, princeedwardisland.ca, gov.nl.ca, yukon.ca, gov.nt.ca, gov.nu.ca, canadabusiness sites, CRA (canada.ca/charities).
3. If a fact cannot be verified, write around it (e.g., "check the current fee schedule") rather than stating a number.
4. Date-sensitive content: today is 2026-07-17. "Recent grants awarded" items must be from 2025 or 2026 and carry a source link + month/year.
5. Word count per page: 1,200–1,800 words. Write for humans first; no keyword stuffing (primary keyword in H1, first 100 words, one H2, and meta title/description — naturally).
6. Canadian English spelling (organization is fine; use "cheque", "licence" as noun, etc.).
7. No bullet-point-only pages — flowing prose with tables and lists where they genuinely help.
8. Never mention Claude, AI, or this workflow in the content.

## File format — every page starts with this frontmatter
```yaml
---
title: "SEO title, <= 60 chars, includes primary keyword + year where natural"
metaDescription: "<= 155 chars, includes primary keyword + CTA verb"
slug: "/not-for-profit/alberta"            # see slug map below
primaryKeyword: "..."
secondaryKeywords: ["...", "...", "...", "...", "..."]
jurisdiction: "Alberta"                     # or "Federal"
cluster: "nfp-incorporation"                # or "nfp-grants"
lastUpdated: "2026-07-17"
schemaSuggestions: ["FAQPage", "Service", "BreadcrumbList"]
---
```

## Slug map
- Incorporation cluster: `/not-for-profit/` (pillar), `/not-for-profit/federal`, `/not-for-profit/ontario`, `/not-for-profit/british-columbia`, `/not-for-profit/alberta`, `/not-for-profit/saskatchewan`, `/not-for-profit/manitoba`, `/not-for-profit/quebec`, `/not-for-profit/nova-scotia`, `/not-for-profit/new-brunswick`, `/not-for-profit/prince-edward-island`, `/not-for-profit/newfoundland-and-labrador`, `/not-for-profit/yukon`, `/not-for-profit/northwest-territories`, `/not-for-profit/nunavut`, `/not-for-profit/book-free-consultation`
- Grants cluster: `/nfp-grants/` (pillar) plus the same jurisdiction suffixes (e.g., `/nfp-grants/alberta`).
- File names in workspace mirror the slug last segment: e.g. `/home/claude/crs-content/nfp-incorporation/alberta.md`, `/home/claude/crs-content/nfp-grants/alberta.md`. Federal = `federal.md`.

## INCORPORATION PAGE — required section order
1. `# H1` — e.g. "How to Incorporate a Not-for-Profit in Alberta (Societies Act Guide)" — use the actual governing act name.
2. Intro (2 short paragraphs): what a not-for-profit is under this jurisdiction's law, who regulates it, who this guide is for.
3. `## Key facts at a glance` — a table: Governing legislation | Regulator/registry | Minimum directors | Director residency requirement | Minimum members/incorporators | Government filing fee | Typical processing time | Annual filing requirement. Only verified values.
4. `## What counts as a not-for-profit in {Jurisdiction}` — legal definition, non-distribution constraint, difference vs. registered charity (CRA) and vs. for-profit corporation.
5. `## Why incorporate your not-for-profit` — limited liability, perpetual existence, credibility with funders/grants, ability to open bank accounts, hold property, apply for charitable registration later.
6. `## Step-by-step: how to incorporate` — numbered steps specific to the jurisdiction: name search/reservation (NUANS or provincial equivalent), preparing articles/constitution & bylaws, minimum board, registered office, filing method (online portal/email/registry agent), fee, what you receive.
7. `## Official forms and links` — table of the actual government forms (name, purpose, link). Only verified URLs.
8. `## After incorporation: ongoing compliance` — annual returns/reports, AGMs, keeping registers, changes filings; consequence of non-compliance (dissolution).
9. `## Frequently asked questions` — 5–6 `###` questions phrased like real searches ("How many board members do I need for a nonprofit in Alberta?", "How much does it cost to register a society in Alberta?", "Can a not-for-profit make a profit in Canada?"...) with 40–70 word direct answers (featured-snippet style).
10. CTA block (verbatim, adjusting {Jurisdiction}):

> ## Start your {Jurisdiction} not-for-profit with expert help — free consultation
>
> You bring the mission; we handle the paperwork. In one free consultation, a BizFile Canada incorporation specialist will review your three proposed names, confirm your board meets {Jurisdiction}'s minimum director requirements, and map out every form, fee, and filing you need — including whether federal or provincial incorporation is the better fit and how it affects future grant and charity applications.
>
> **[Book your free not-for-profit consultation →](/not-for-profit/book-free-consultation)**
>
> *Tell us about your organization — proposed names, board members, registered address, and what your not-for-profit will do — and we'll come to the call prepared.*

11. `## Related guides` — internal links: pillar `[Not-for-Profit Incorporation in Canada: The Complete Guide](/not-for-profit/)`, this jurisdiction's grants page `[{Jurisdiction} grants for not-for-profits](/nfp-grants/{slug-suffix})`, federal page if provincial (and vice versa).

## GRANTS PAGE — required section order
1. `# H1` — e.g. "Grants for Not-for-Profits in Alberta (2026 Funding Guide)".
2. Intro: funding landscape for NFPs in the jurisdiction, who funds (province, feds, foundations, lottery/gaming where applicable).
3. `## Major {Jurisdiction} grant programs for not-for-profits` — table per program: Program | Funder | What it funds | Typical amount | Intake window/deadline | Link. 4–8 verified programs. Include flagship programs (e.g., Ontario Trillium Foundation, BC Community Gaming Grants, Alberta CFEP/CIP, SK Community Initiatives Fund, MB Building Sustainable Communities...).
4. `## Federal grants {Jurisdiction} not-for-profits can also access` — brief table/prose (Canada Summer Jobs, New Horizons for Seniors, Enabling Accessibility Fund, environmental/cultural funds etc.), link to `/nfp-grants/federal`.
5. `## Recently awarded grants in {Jurisdiction}` — 2–4 dated 2025/2026 examples of announced recipients or funding rounds, each with month/year + source link. If genuinely none found, replace with "Latest funding news" describing current intake rounds (dated, sourced).
6. `## Who qualifies — and why incorporation matters` — most programs require incorporated NFP status (and sometimes 1+ year of operation, financial statements, board governance); segue to incorporation service.
7. `## How to strengthen your grant application` — practical prose tips (governance, budgets, outcomes measurement, letters of support).
8. `## Frequently asked questions` — 4–6 search-style questions ("What grants are available for nonprofits in Alberta?", "Do you need to be a registered charity to get grants in Canada?"...), 40–70 word answers.
9. CTA block (verbatim, adjust {Jurisdiction}):

> ## Grant-ready starts with incorporated — free consultation
>
> Funders fund organizations, not ideas. Before the next intake deadline, get your not-for-profit incorporated and grant-ready: a BizFile Canada specialist will review your proposed names, board, and mission in a free consultation and set up the corporate records funders ask for — certificate of incorporation, registered office, minute book, and annual filings.
>
> **[Book your free not-for-profit consultation →](/not-for-profit/book-free-consultation)**

10. `## Related guides` — internal links: grants pillar `[Grants for Not-for-Profits in Canada](/nfp-grants/)`, this jurisdiction's incorporation page, federal grants page if provincial.

## SEO keyword pattern (adapt per jurisdiction, verify phrasing feels natural)
- Incorporation primary: "how to incorporate a not-for-profit in {Jurisdiction}" or "{Jurisdiction} societies act incorporation" (choose whichever matches the act's common name — e.g. BC/AB/NS/YT/NWT/NU = "society/societies act", ON = "ONCA not-for-profit", federal = "Canada Not-for-profit Corporations Act").
- Incorporation secondary: "register a nonprofit in {jurisdiction}", "start a non-profit organization {jurisdiction}", "{act short name} requirements", "nonprofit board requirements {jurisdiction}", "cost to register a nonprofit in {jurisdiction}".
- Grants primary: "grants for nonprofits in {Jurisdiction}" / "nonprofit grants {Jurisdiction} 2026".
- Grants secondary: "{Jurisdiction} community grants", "government funding for nonprofits {jurisdiction}", "{flagship program name}", "how to apply for nonprofit grants {jurisdiction}".

## Research method (required)
- Use WebSearch first to find the official registry/act/program pages, then WebFetch the key official pages to verify: act name, minimum directors, residency, fees, forms, program amounts, deadlines.
- Record real URLs from results. If a WebFetch fails, keep the URL only if it came from a search result title you trust (gov domain), otherwise drop it.
- Do NOT copy text from sources — write original prose.
