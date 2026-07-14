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
  enrichStatus:   "pending" | "found" | "phone_or_web_only" | "not_found" | "skip_numbered" | "bounced" | "unsubscribed";
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

/* -- Name similarity gate (same as scripts/enrich_contacts.mjs) -- */
function normTokens(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLP|LP|ULC|PROFESSIONAL|HOLDINGS?)\b/g, "")
    .split(/\s+/).filter((t) => t.length > 1);
}
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normTokens(a)), tb = new Set(normTokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
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
  similarity:       number;   // 0..1 against the source corp name
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
        "X-Goog-FieldMask":    "places.displayName,places.websiteUri,places.internationalPhoneNumber,places.formattedAddress",
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
    }>};
    return (data.places ?? []).map((p) => ({
      displayName:      p.displayName?.text ?? "",
      formattedAddress: p.formattedAddress ?? "",
      phone:            p.internationalPhoneNumber ?? null,
      website:          p.websiteUri ?? null,
      similarity:       nameSimilarity(name, p.displayName?.text ?? ""),
    }));
  } catch (e) {
    console.error("[places] error:", e);
    return [];
  }
}

/** Legacy auto-pick wrapper — first candidate with similarity ≥ 0.5.
 *  Used by the profile-page and bulk-enrichment paths where there's no
 *  human to disambiguate. */
async function callPlaces(name: string, city: string, postalCode?: string): Promise<PlacesHit | null> {
  const candidates = await getPlacesCandidates(name, city, postalCode);
  for (const c of candidates) {
    if (c.similarity >= 0.5) {
      return {
        website:     c.website ?? "",
        phone:       c.phone ?? "",
        matchedName: c.displayName,
        similarity:  c.similarity,
      };
    }
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
