# Alberta Registry Data Pipeline — Handoff Doc

What exists, how it updates, and what to build next. Written 2026-07-08.

## 1. What this is

A self-updating dataset of **1,506,198 Alberta corporations** derived from 21 years (2006–2026) of Alberta Registrar's Periodical notices, powering: (a) public company-profile pages with live verification, (b) outreach lists for CRS services (annual returns $99, reinstatement, MinuteBook $299).

Model: same public source albertacorporations.com uses (they index 1.44M companies from Gazette notices) — plus two advantages they lack: live registry cross-check at view time, and services attached to every page.

## 2. Data source

- **Alberta Registrar's Periodical**, published by Alberta King's Printer on the **15th and last day of each month** (~24 issues/year).
- Year index: `https://kings-printer.alberta.ca/alberta_gazette.cfm?page=gazette_<YEAR>_registrar.cfm`
- Issue text files: `https://kings-printer.alberta.ca/documents/gazette/<YEAR>/text/<NN>_<MonDD>_Registrar.cfm` (label quirks exist: "Sept", "July", Feb 13/27 — always take exact filenames from the index page, never guess).
- Sections per issue: registrations/incorporations/continuations (with address + corp number) · corporate name changes · certificates of intent to dissolve · **liable for dissolution** (name-only list, 4-month countdown to strike-off) · **dissolved/struck off** (name-only) · revived/reinstated · amalgamations.
- Legal: public data; site must disclaim "independent index, not the official registry." Review King's Printer copyright (kings-printer.alberta.ca/copyright.cfm) before public republication.

## 3. Repo assets

| Path | What it is |
|---|---|
| `data/registrar/<year>/*.cfm` | Raw archive, 2006–2026 (~500 files, ~240 MB). Append-only — never modify. |
| `data/registrar_companies.csv` | **Master: 1.51M companies.** Columns: corp_number, company_name, entity_type, derived_status, last_event_date, last_event_section, address, city, postal_code, last_issue. |
| `data/outreach_new_incorporations_2026.csv` | 26,826 corps incorporated Jan–Jun 2026 with addresses (11,152 Calgary, 7,568 Edmonton). |
| `data/watchlist_liable_2026.csv` | 27,797 corps gazetted liable-for-dissolution in 2026 (name-only — match via company search). |
| `data/registrar_delta_YYYY-MM-DD.csv` | **Incremental drops** (created by scheduled task, see §5). Same columns as events. |
| `data/PIPELINE-STATUS.md` | Run log written by the scheduled task. |
| `scripts/download_registrar_archive.py` | Bulk downloader. Reads year index pages for exact filenames, 3 retries, resume-safe (skips existing). `python scripts/download_registrar_archive.py --from 2006 --to 2026` |
| `scripts/parse_registrar_periodical.py` | Parser. `--local data/registrar` parses all downloaded files offline → `registrar_all_events.csv` (every event) + `registrar_companies.csv` (latest event per corp = derived status). Section-aware: handles all 7 notice formats. |

Events CSV columns: `company_name, entity_type, event, section, event_date, address, city, postal_code, corp_number, issue`.

Event values: Incorporated, Registered, Continued, Renamed (was: OLD), Intent To Dissolve, Liable For Dissolution, Dissolved/Struck Off, Revived, Amalgamated.

2026 H1 volumes for scale: 24,045 incorporated · 27,797 liable · 24,042 dissolved/struck · 5,223 revived · 2,293 renamed · 1,010 amalgamated.

## 4. Data quirks the DB layer must handle

1. **Name-only rows:** liable-for-dissolution and dissolved/struck-off notices have NO corp number and no address. Match to existing companies by normalized name (uppercase, strip trailing periods); unmatched names insert as number-less records.
2. **Derived status is inferred**, not authoritative — it's the last *gazetted* event, weeks stale by definition. Anything user-facing or outreach-facing must be verified via live lookup (§6).
3. **Duplicate/replayed deltas must be harmless** — enforce uniqueness on (issue, corp_number, event, company_name).
4. Old issues (2006–2012) have OCR-era noise; a small % of rows have imperfect names/addresses.
5. Numbered companies ("2813043 ALBERTA INC") are ~half of incorporations — corp_number often ≈ name digits.

## 5. Update cycle (already scheduled)

A Cowork scheduled task (**alberta-registrar-delta**, runs 9:00 AM on the 1st and 16th, i.e. the day after each publication) does: check index → download any missing issue into `data/registrar/<year>/` → parse only the new issue → write `data/registrar_delta_YYYY-MM-DD.csv` → log to `data/PIPELINE-STATUS.md`. It never touches existing raw files or the master CSV.

**The coding app's job:** a file-watcher/import job that picks up `registrar_delta_*.csv`, upserts, and archives the processed file (move to `data/processed/`).

## 6. MongoDB schema + import logic

Two core collections. At 1.5M + 2.75M docs this is comfortably single-node territory — no sharding; one well-indexed replica set (or Atlas M10+) is enough.

### `companies` (~1.5M docs, the read workhorse)

```js
{
  _id: "2128181365",                    // corp_number; name-only records: "name:ACME WIDGETS LTD"
  name: "01 EXCELLENT SECURITY INC",
  nameNorm: "01 EXCELLENT SECURITY INC",// normalized (uppercase, no trailing punctuation) — for name-only matching
  entityType: "Federal Corporation",
  status: {
    derived: "Incorporated",            // last gazetted event
    lastEventDate: ISODate("2026-05-15"),
    lastIssue: "2026/11_Jun15_Registrar",
    live: null,                         // from live registry lookup
    liveCheckedAt: null
  },
  address: { full: "220-92 SADDLETREE CRT NE, CALGARY ALBERTA, T3J0K9",
             city: "Calgary", postal: "T3J0K9" },
  contact: {                            // enrichment layer (§9)
    email: null, emailSourceUrl: null,  // sourceUrl = CASL proof, mandatory when email set
    website: null, phone: null,
    enrichedAt: null, enrichStatus: "pending" // pending|found|not_found|bounced|unsubscribed
  },
  outreach: { lastEmailAt: null, sequenceStep: 0, replied: false, orderId: null },
  slug: "01-excellent-security-inc-2128181365"  // for public profile URLs
}
```

Indexes: `{nameNorm: 1}`, `{ "address.city": 1, "status.derived": 1 }`, `{ "status.derived": 1, "status.lastEventDate": -1 }`, `{ slug: 1 } unique`, `{ "contact.enrichStatus": 1 }` (enrichment queue), text index on `name` for search.

### `events` (~2.75M docs, append-only)

```js
{ corpNumber: "2128181365",             // may be "" for name-only notices
  companyNameNorm: "...", event: "Incorporated", section: "registered",
  eventDate: ISODate(...), issue: "2026/11_Jun15_Registrar",
  address: "...", city: "...", postal: "..." }
```

Unique compound index `{issue: 1, corpNumber: 1, companyNameNorm: 1, event: 1}` makes delta replays no-ops. Secondary: `{corpNumber: 1, eventDate: -1}` (profile timelines), `{event: 1, eventDate: -1}` (watchlists).

### Import rules (delta job)

1. For each row in `registrar_delta_*.csv`: `insertOne` into `events` with `ordered:false` bulkWrite — duplicate-key errors are expected and ignored.
2. Upsert `companies` only when incoming `eventDate >=` stored `status.lastEventDate` (use an aggregation-pipeline update with `$cond`, or read-compare-write in the import script). Never overwrite `address`/`contact` with empty values — name-only rows carry no address.
3. Name-only rows (liable/dissolved): look up by `nameNorm`; if matched, update that company's status; if not, insert with synthetic `_id: "name:<NORM>"`. If a later numbered record matches the same nameNorm, merge (keep corp number as _id, migrate contact/outreach fields).
4. Move processed delta files to `data/processed/`.

Optional third collection `lookups` (live verification cache): `{corpNumber, source, payload, fetchedAt}` with a TTL index (`expireAfterSeconds: 86400`) — gives you the 24h live-check cache for free.

## 7. App behaviour (public pages)

1. Serve profile pages from the DB instantly (name, number, type, event timeline, derived status).
2. On page view, fire the existing live lookup (`/api/company-search` — Canada Business Registries / OrgBook) by corp number or name; update `live_status` + `last_verified_at`; render a "Verified <time>" badge. Cache lookups (e.g. 24h) to limit external calls.
3. Every profile carries CTAs by status: Active → "File annual return $99" / "Generate minute book $299"; Liable → urgent "File now — 4-month countdown"; Struck/Dissolved → "Reinstate + revive"; fresh incorporation → "Minute book legally required in your first 90 days."
4. Disclaimer on every page: independent index of public Gazette notices, not the official Alberta registry; certified searches via official channels.
5. SEO: each company page indexable (this is albertacorporations.com's entire traffic engine — 1.4M pages) with clean slugs, JSON-LD Organization schema, city/status browse pages.

## 8. Caveats & compliance (do not skip)

- Outreach using this data: Gazette gives addresses, not emails. CASL rules still apply to email — verify a publicly listed business email per contact and log the source URL. Registered-address **direct mail is CASL-exempt** and worth testing for the liable-for-dissolution list.
- Never present derived_status as current without live verification — a wrong "struck off" label on an active business is a defamation-adjacent risk.
- Rate-limit external calls (gov servers, live lookups). The pipeline is deliberately polite (single fetch per issue, 2s delays on bulk).

## 9. Contact enrichment pipeline (finding emails at scale)

Goal: turn watchlist/outreach rows into contactable records with a **CASL-defensible source URL per email**. Manual googling doesn't scale to 27K names; automate as a queue worker over `companies` where `contact.enrichStatus: "pending"`.

### Step 0 — prioritize before searching (cuts the queue ~70%)

1. Match watchlist names against `companies` by `nameNorm` to recover corp number, city, address.
2. **Skip numbered companies** ("2813043 ALBERTA LTD") — no web presence to find; route these to direct mail (registered address from the master, CASL-exempt).
3. Prioritize named corps in cities, newest `lastEventDate` first (freshest = most reachable and most saveable).

### Step 1 — automated discovery, per company (cheap → expensive)

1. **Google Places API** (Text Search: `"<name>" <city>` → Place Details): returns website + phone for any business with a Maps listing. ~USD 0.02/lookup, the single highest-yield step.
2. **Website crawl** (own scraper): fetch homepage + `/contact`, `/about`, `/contact-us`; regex `mailto:` and email patterns; prefer domain-matching addresses (info@theirdomain) over gmail. Store the page URL as `emailSourceUrl`.
3. **Domain email finders** for the remainder with a website but no visible email: Hunter.io / Snov.io APIs (~USD 0.01–0.05/find) return pattern-based addresses with confidence scores — accept only high-confidence.
4. **Apollo** (connected in Cowork): `organizations_enrich` / people search for the larger corporations — weak coverage for micro-businesses, good for anything with LinkedIn presence.
5. **Fallback = channel switch, not more searching:** no website found → direct mail to registered address, or phone from Places (calls are outside CASL; observe DNCL rules).

**Worker script: `scripts/enrich_contacts.mjs`** implements steps 0–2 (Places → crawl → MX → write-back). Requires `npm i mongodb`, env `MONGODB_URI`, `DB_NAME`, `GOOGLE_PLACES_API_KEY`. Run `node scripts/enrich_contacts.mjs --batch 50` (add `--dry-run` to test). It marks numbered corps `skip_numbered`, writes `found` / `phone_or_web_only` / `not_found` statuses, and only saves emails that pass a name-similarity gate (≥0.5 vs the Places result) and an MX check.

### Step 2 — validate & store

- Syntax + MX-record check before saving (dead domains are common on liable-list companies).
- Write back: `contact.email`, `contact.emailSourceUrl`, `contact.website`, `contact.phone`, `enrichStatus: "found"|"not_found"`, `enrichedAt`.
- Every send/bounce/unsubscribe updates `outreach.*` — bounced or unsubscribed addresses are never re-queued.

### Expected yield (be realistic)

Named corporations with a city: ~25–40% end with a usable email; numbered corps: near zero (mail/phone instead). On the 2026 liable list (~28K, maybe 15K named), expect roughly 4–6K emails — more than enough to saturate a 30/day CASL-careful sequence for months. Cost at Places + Hunter rates: roughly USD 300–500 for the full named list; run it in priority batches of 1–2K instead of all at once.

