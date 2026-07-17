import dns from "node:dns/promises";
import { companies, lookups, ensureLookupsIndex, type CompanyDoc } from "./registrar-mongo";

/**
 * Live-fetch layer for the corporation profile page.
 *
 * Two upstreams:
 *   - CBR (Canada Business Registries) — returns real-time status_state,
 *     status_notes. Cached 1 hour in the lookups collection.
 *   - Google Places API + website crawl + MX check — for contact enrichment.
 *     Cached 90 days on the companies doc via `contact.enrichedAt`.
 *
 * Both paths write results back to Mongo so the next view is instant.
 */

const CBR_TTL_MS      = 1 * 3600 * 1000;              // 1 hour
const PLACES_FRESH_MS = 90 * 24 * 3600 * 1000;        // 90 days

const UA = "CRS-profile/1.0 (+https://www.corporateregistryservices.ca; support@corporateregistryservices.ca)";
const NUMBERED_RE = /^\d{5,}\s+(ALBERTA|CANADA|ONTARIO|BRITISH COLUMBIA|B\.?C\.?|SASKATCHEWAN|MANITOBA|QUEBEC)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ═══════════════════════════ CBR ═══════════════════════════ */

export type LiveCbrStatus = {
  found:        boolean;
  status:       string;         // "Active" | "Inactive" | ""
  statusNotes:  string;         // free-text: "Inactive - Amalgamated", "Struck", etc.
  entityType:   string;
  jurisdiction: string;
  registryId:   string;
  fetchedAt:    Date;
  source:       "cbr";
};

/** Look up an Alberta corporation live via CBR. Cached 1 hour. */
export async function fetchLiveCbrStatus(corpNumber: string): Promise<LiveCbrStatus | null> {
  if (!corpNumber || !/^\d+$/.test(corpNumber)) return null;
  await ensureLookupsIndex();
  const cache = await lookups();
  const cacheKey = `cbr:${corpNumber}`;

  const cached = await cache.findOne({ _id: cacheKey });
  if (cached && (Date.now() - cached.fetchedAt.getTime()) < CBR_TTL_MS) {
    return { ...(cached.payload as LiveCbrStatus), fetchedAt: cached.fetchedAt };
  }

  const url =
    `https://ised-isde.canada.ca/cbr/srch/api/v1/search` +
    `?fq=keyword:%7B${encodeURIComponent(corpNumber)}%7D` +
    `&fq=Registry_Source:AB` +
    `&lang=en&queryaction=fieldquery&rows=3&start=0`;

  let payload: LiveCbrStatus;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      /* Next 15+ RSC fetch cache: opt out — we manage caching in Mongo */
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CBR ${res.status}`);
    const data = await res.json() as { docs?: Array<Record<string, unknown>> };
    const hit  = (data.docs ?? []).find((d) => {
      const mrasId = String(d.MRAS_ID ?? "").replace(/^AB_/, "");
      return mrasId === corpNumber || String(d.Juri_ID ?? "") === corpNumber;
    });
    if (!hit) {
      payload = { found: false, status: "", statusNotes: "", entityType: "", jurisdiction: "", registryId: "", fetchedAt: new Date(), source: "cbr" };
    } else {
      payload = {
        found:        true,
        status:       String(hit.Status_State ?? ""),
        statusNotes:  String(hit.Status_Notes ?? ""),
        entityType:   String(hit.Entity_Type ?? hit.MRAS_Entity_Type ?? ""),
        jurisdiction: String(hit.Jurisdiction ?? "AB"),
        registryId:   String(hit.MRAS_ID ?? "").replace(/^AB_/, ""),
        fetchedAt:    new Date(),
        source:       "cbr",
      };
    }
  } catch (e) {
    console.error("[cbr] fetch failed for", corpNumber, e);
    return null;
  }

  /* Cache both in `lookups` (TTL-swept) and on `companies` (permanent, so
     the search results can show live status if we have it). */
  await cache.replaceOne(
    { _id: cacheKey },
    { source: "cbr", payload, fetchedAt: payload.fetchedAt },
    { upsert: true },
  );
  await (await companies()).updateOne(
    { _id: corpNumber },
    { $set: {
      "status.live":          payload.found ? payload.status : "not_found",
      "status.liveNotes":     payload.statusNotes,
      "status.liveCheckedAt": payload.fetchedAt,
    }},
  );

  return payload;
}

/* ═══════════════════════════ Places + Crawl ═══════════════════════════ */

export type EnrichmentResult = {
  email:          string | null;
  emailSourceUrl: string | null;
  website:        string | null;
  phone:          string | null;
  enrichedAt:     Date;
  enrichStatus:   "pending" | "found" | "phone_or_web_only" | "not_found" | "skip_numbered" | "bounced" | "unsubscribed" | "needs_review";
  /* Places signal-quality — filled from getPlacesCandidates when the
     operator picks a candidate. Optional / nullable to keep older cached
     enrichments valid without a schema migration. */
  rating?:         number | null;
  reviewCount?:    number | null;
  businessStatus?: string | null;   // OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY
  mapsUrl?:        string | null;
};

/** True if this company is stale/pending and should be re-enriched now. */
export function needsEnrichment(company: CompanyDoc): boolean {
  const c = company.contact;
  if (!c) return true;
  if (c.enrichStatus === "pending") return true;
  if (c.enrichStatus === "skip_numbered") return false;   // never retry numbered corps
  if (c.enrichStatus === "unsubscribed") return false;
  if (!c.enrichedAt) return true;
  const enrichedAt = c.enrichedAt instanceof Date ? c.enrichedAt : new Date(c.enrichedAt);
  return (Date.now() - enrichedAt.getTime()) >= PLACES_FRESH_MS;
}

/* ─── Name-matching gate ────────────────────────────────────────────────
 * Previous version returned `hit / min(|a|,|b|)` which forgave extra
 * tokens — "AL-AKKAD CONSULTING SERVICES" vs "KAD CONSULTING SERVICES"
 * scored 0.667 (2/3) purely on shared industry suffix. Google Places
 * fell through to KAD's website + email as AL-AKKAD's contact.
 *
 * New gate = three checks (all must pass):
 *   1. Jaccard(tokens) >= 0.55  — symmetric, extra tokens hurt the score.
 *   2. Brand-token match        — first significant token of the source
 *                                  name must appear in the candidate's
 *                                  tokens (with tolerant prefix handling
 *                                  for AL-/MC-/ST-/DE-/EL-/LA-/LE-).
 *   3. Postal FSA match         — when the source corp has a postal, the
 *                                  candidate's formattedAddress must
 *                                  contain the same 3-char forward
 *                                  sortation area (T2P, T5J, etc.).
 * Same rule set is used by the auto-pick fallback in callPlaces below. */

function normTokens(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLP|LP|ULC|PROFESSIONAL|HOLDINGS?)\b/g, "")
    .split(/\s+/).filter((t) => t.length > 1);
}

/** Symmetric name similarity — Jaccard over the normalized token sets. */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normTokens(a)), tb = new Set(normTokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  const unionSize = ta.size + tb.size - hit;
  return unionSize > 0 ? hit / unionSize : 0;
}

/** Prefixes we strip when computing the "brand" token so that "AL-AKKAD"
 *  → brand "AKKAD", "MCDONALD" → brand "DONALD", "DELUCA" → "LUCA", etc.
 *  Only applied to the FIRST token because these prefixes are article- or
 *  patronymic-style and don't reliably survive re-tokenization on the
 *  Google side (Places often normalizes them out or joins them). */
const BRAND_PREFIX_RE = /^(AL|EL|LA|LE|LES|LOS|DE|DEL|DA|DAS|DI|DO|MC|MAC|ST|SAINTE?)$/;

/** Return the first "distinctive" token of a name — the brand identifier
 *  the SERP algorithm actually needs to see in a Places result to consider
 *  them the same business. Strips corporate suffixes AND leading
 *  article-style prefixes. Returns "" for numbered or all-suffix names. */
function brandToken(name: string): string {
  const tokens = normTokens(name);
  if (!tokens.length) return "";
  // Strip the leading prefix by splitting on the hyphen/space and picking
  // the tail if the head matches BRAND_PREFIX_RE. Handles both "AL-AKKAD"
  // (already split by normTokens into ["AL","AKKAD"]) and "AL AKKAD".
  const head = tokens[0];
  if (BRAND_PREFIX_RE.test(head) && tokens.length > 1) return tokens[1];
  return head;
}

/** True if the candidate's tokens contain the source corp's brand token,
 *  OR its brand token contains the source's (accommodates "AKKAD" ↔
 *  "AKKAD-HAJDU" and similar sub-brand variants). */
function brandTokenMatches(sourceName: string, candidateName: string): boolean {
  const source = brandToken(sourceName);
  if (!source) return true;                       // no brand to check — don't reject
  const candTokens = new Set(normTokens(candidateName));
  const candBrand  = brandToken(candidateName);
  return candTokens.has(source) || (!!candBrand && (candBrand.includes(source) || source.includes(candBrand)));
}

/** Match a Canadian FSA (Forward Sortation Area — 3-char postal code
 *  prefix, e.g. "T2P" for downtown Calgary). Returns "" when no FSA is
 *  detectable. */
function fsa(postal: string | undefined | null): string {
  if (!postal) return "";
  const m = postal.replace(/\s+/g, "").toUpperCase().match(/^([A-Z]\d[A-Z])/);
  return m ? m[1] : "";
}

/** True if either (a) we have no source postal to check against, or
 *  (b) the candidate's formattedAddress contains the same FSA. */
function postalMatches(sourcePostal: string | undefined, candidateAddress: string): boolean {
  const src = fsa(sourcePostal);
  if (!src) return true;                          // don't reject when we can't check
  const cand = candidateAddress.toUpperCase().replace(/\s+/g, "");
  // Match the exact 3-char FSA as a whole token — bounded by non-alphanumeric
  // or string edges — so "T2P" doesn't match "T2P0X6" only via a partial
  // substring elsewhere in the address.
  return new RegExp(`(?:^|[^A-Z0-9])${src}(?:[^A-Z0-9]|$|\\d[A-Z]\\d)`).test(cand);
}

/** Match threshold + composite gate. All three must pass for an auto-pick
 *  candidate to be accepted. The manual "picked" flow in the outreach API
 *  still lets the operator override this via visual confirmation, but the
 *  auto-pick backfill / delta paths use this as their hard rule. */
const MIN_JACCARD = 0.55;

function candidatePassesGate(
  sourceName:      string,
  sourcePostal:    string | undefined,
  candidateName:   string,
  candidateAddress: string,
): { pass: boolean; reason?: string } {
  const j = nameSimilarity(sourceName, candidateName);
  if (j < MIN_JACCARD)                        return { pass: false, reason: `jaccard ${j.toFixed(2)} < ${MIN_JACCARD}` };
  if (!brandTokenMatches(sourceName, candidateName)) return { pass: false, reason: `brand "${brandToken(sourceName)}" missing from candidate tokens` };
  if (!postalMatches(sourcePostal, candidateAddress)) return { pass: false, reason: `FSA "${fsa(sourcePostal)}" not in candidate address` };
  return { pass: true };
}

/* -- Email extraction from a fetched page -- */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL = /(\.png|\.jpg|\.gif|\.webp|example\.|sentry|wixpress|godaddy|yourdomain|domain\.com|email\.com|@2x)/i;

function extractEmails(html: string, siteHost: string): string[] {
  const scored = new Map<string, number>();
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase().replace(/^mailto:/, "");
    if (JUNK_EMAIL.test(email) || email.length > 60) continue;
    const dom = email.split("@")[1];
    let score = 1;
    if (siteHost && (siteHost.endsWith(dom) || dom.endsWith(siteHost.replace(/^www\./, "")))) score += 10;
    if (/^(info|contact|office|admin|hello|inquiries|sales)@/.test(email)) score += 3;
    scored.set(email, Math.max(scored.get(email) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
}

async function fetchTextWithTimeout(url: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function hasMx(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1];
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch { return false; }
}

/* -- Google Places Text Search + Place Details (New API) -- */

type PlacesHit = { website?: string; phone?: string; matchedName?: string; similarity?: number };

export type PlaceCandidate = {
  displayName:      string;
  formattedAddress: string;
  phone:            string | null;
  website:          string | null;
  similarity:       number;              // 0..1 against the source corp name
  /* Signal-quality fields — see the field-mask below. Cheap addition
     (~$0.005/lookup atmosphere-tier surcharge) that lets the outreach
     console spot dead / low-signal businesses before wasting a send. */
  rating:           number | null;       // 1.0..5.0 or null if unrated
  reviewCount:      number | null;       // total user ratings
  businessStatus:   string | null;       // OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY
  mapsUrl:          string | null;       // canonical Google Maps deep-link to the business
};

/** Query Places for a business name in a city. Postal code is included in
 *  the text query when provided — it strongly disambiguates same-name
 *  businesses across cities/provinces. Returns raw candidates without
 *  picking one. */
export async function getPlacesCandidates(name: string, city: string, postalCode?: string): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn("[places] GOOGLE_PLACES_API_KEY not set — enrichment skipped");
    return [];
  }
  const q = [name, city, postalCode].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type":       "application/json",
        "X-Goog-Api-Key":      key,
        // Includes atmosphere-tier fields (rating, userRatingCount) — small
        // cost bump per request (~$0.005), pays back by letting the outreach
        // console skip dead businesses before drafting.
        "X-Goog-FieldMask":    "places.displayName,places.websiteUri,places.internationalPhoneNumber,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 3 }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[places] ${res.status}: ${text.slice(0, 200)}`);
      return [];
    }
    const data = await res.json() as { places?: Array<{
      displayName?: { text?: string };
      websiteUri?: string;
      internationalPhoneNumber?: string;
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      businessStatus?: string;
      googleMapsUri?: string;
    }>};
    return (data.places ?? []).map((p) => ({
      displayName:      p.displayName?.text ?? "",
      formattedAddress: p.formattedAddress ?? "",
      phone:            p.internationalPhoneNumber ?? null,
      website:          p.websiteUri ?? null,
      similarity:       nameSimilarity(name, p.displayName?.text ?? ""),
      rating:           typeof p.rating === "number" ? p.rating : null,
      reviewCount:      typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      businessStatus:   p.businessStatus ?? null,
      mapsUrl:          p.googleMapsUri ?? null,
    }));
  } catch (e) {
    console.error("[places] error:", e);
    return [];
  }
}

/** Auto-pick wrapper — first candidate that passes the composite gate
 *  (Jaccard ≥ 0.55 + brand-token match + postal FSA match). Used by the
 *  profile-page and bulk-enrichment paths where there's no human to
 *  disambiguate. The manual /admin/outreach flow still lets the operator
 *  override with visual confirmation. */
async function callPlaces(name: string, city: string, postalCode?: string): Promise<PlacesHit | null> {
  const candidates = await getPlacesCandidates(name, city, postalCode);
  for (const c of candidates) {
    const gate = candidatePassesGate(name, postalCode, c.displayName, c.formattedAddress);
    if (!gate.pass) continue;
    return {
      website:     c.website ?? "",
      phone:       c.phone ?? "",
      matchedName: c.displayName,
      similarity:  c.similarity,
    };
  }
  return null;
}

/** Crawl a business website's homepage + common contact-page paths, extract
 *  the highest-confidence public email, and MX-verify it. Returns null on
 *  no match. Extracted from runPlacesEnrichment so it can be called
 *  standalone once the operator picks a Place. */
export async function crawlForEmail(website: string): Promise<{ email: string; sourceUrl: string } | null> {
  let siteHost = "";
  try {
    siteHost = new URL(website.startsWith("http") ? website : `http://${website}`).host.toLowerCase();
  } catch {
    return null;
  }
  const base = website.replace(/\/+$/, "");
  const paths = ["", "/contact", "/contact-us", "/about"];
  for (const p of paths) {
    const url = base + p;
    const html = await fetchTextWithTimeout(url);
    if (!html) continue;
    const candidates = extractEmails(html, siteHost);
    for (const e of candidates) {
      if (await hasMx(e)) return { email: e, sourceUrl: url };
    }
    await sleep(400);
  }
  return null;
}

/** Core enrichment logic (auto path): Places lookup → auto-pick best match
 *  → crawl website for email → MX-verify. Used by the profile page and
 *  bulk enrichment where there's no human to disambiguate. Postal code
 *  when supplied strongly narrows same-name matches across cities. */
export async function runPlacesEnrichment(name: string, city: string, postalCode?: string): Promise<EnrichmentResult | null> {
  const now = new Date();

  if (NUMBERED_RE.test(name)) {
    return { email: null, emailSourceUrl: null, website: null, phone: null,
             enrichedAt: now, enrichStatus: "skip_numbered" };
  }

  const place = await callPlaces(name, city, postalCode);
  const crawled = place?.website ? await crawlForEmail(place.website) : null;

  const status: EnrichmentResult["enrichStatus"] =
    crawled?.email               ? "found" :
    (place?.phone || place?.website) ? "phone_or_web_only" :
                                 "not_found";

  return {
    email:          crawled?.email ?? null,
    emailSourceUrl: crawled?.sourceUrl ?? null,
    website:        place?.website ?? null,
    phone:          place?.phone   ?? null,
    enrichedAt:     now,
    enrichStatus:   status,
  };
}

/** Original companies-collection persist wrapper — kept for the profile-page
 *  path where the caller already has a CompanyDoc from our Alberta DB. */
export async function enrichCompany(company: CompanyDoc): Promise<EnrichmentResult> {
  const result = await runPlacesEnrichment(company.name, company.address?.city ?? "");
  if (!result) throw new Error("enrichment returned no result");
  await (await companies()).updateOne(
    { _id: company._id },
    { $set: { contact: result } },
  );
  return result;
}

/** On-demand enrichment for the outreach console. Cached in `lookups`
 *  with 90-day TTL keyed by corpNumber so repeat lookups of the same corp
 *  don't burn Places API. Also persists back to `companies.contact` if
 *  the corp exists in our Alberta DB. */
export async function enrichForOutreach(params: {
  name:        string;
  city:        string;
  corpNumber?: string;
}): Promise<{ result: EnrichmentResult | null; cached: boolean; source: "lookups" | "companies" | "fresh" }> {
  await ensureLookupsIndex();
  const cache = await lookups();
  const cacheKey = params.corpNumber ? `places:${params.corpNumber}` : null;

  /* 1. Check TTL-cache for this exact corp. */
  if (cacheKey) {
    const cached = await cache.findOne({ _id: cacheKey });
    if (cached && (Date.now() - cached.fetchedAt.getTime()) < PLACES_FRESH_MS) {
      return {
        result: { ...(cached.payload as EnrichmentResult),
                  enrichedAt: cached.fetchedAt },
        cached: true,
        source: "lookups",
      };
    }
  }

  /* 2. For Alberta corps, check the companies collection — it's the source
     of truth for our enriched Alberta corpus. */
  if (params.corpNumber) {
    const company = await (await companies()).findOne({ _id: params.corpNumber });
    if (company?.contact?.enrichedAt) {
      const enrichedAt = company.contact.enrichedAt instanceof Date
        ? company.contact.enrichedAt
        : new Date(company.contact.enrichedAt);
      if (!Number.isNaN(enrichedAt.getTime()) && (Date.now() - enrichedAt.getTime()) < PLACES_FRESH_MS) {
        return {
          result: { ...(company.contact as EnrichmentResult), enrichedAt },
          cached: true,
          source: "companies",
        };
      }
    }
  }

  /* 3. Fresh enrichment. */
  const result = await runPlacesEnrichment(params.name, params.city);
  if (!result) {
    return { result: null, cached: false, source: "fresh" };
  }

  /* 4. Cache in lookups (TTL-swept) and, if this corp is in our Alberta
     DB, also persist to companies.contact so the profile page benefits. */
  if (cacheKey) {
    await cache.replaceOne(
      { _id: cacheKey },
      { source: "places", payload: result, fetchedAt: result.enrichedAt },
      { upsert: true },
    );
  }
  if (params.corpNumber) {
    await (await companies()).updateOne(
      { _id: params.corpNumber },
      { $set: { contact: result } },
    );
  }

  return { result, cached: false, source: "fresh" };
}
