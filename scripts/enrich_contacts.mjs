/**
 * Contact enrichment worker — Google Places → website crawl → MX check → MongoDB write-back
 *
 * Queue: companies where contact.enrichStatus == "pending" (named corps with a city first).
 * For each: find website/phone via Places Text Search, crawl the site for an email,
 * validate the domain's MX records, and write results back with the source URL (CASL proof).
 *
 * Usage:
 *   node scripts/enrich_contacts.mjs --batch 50            # process 50 queued companies
 *   node scripts/enrich_contacts.mjs --batch 10 --dry-run  # no DB writes, verbose
 *
 * Env (.env or shell):
 *   MONGODB_URI=mongodb://localhost:27017
 *   DB_NAME=crs
 *   GOOGLE_PLACES_API_KEY=...          (Places API (New) enabled)
 *   DELAY_MS=1200                      (politeness delay between companies)
 *
 * Deps: npm i mongodb   (everything else is Node 18+ built-ins)
 */

import { MongoClient } from "mongodb";
import dns from "node:dns/promises";

// ── config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BATCH = parseInt(argVal("--batch", "50"), 10);
const DRY = args.includes("--dry-run");
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "1200", 10);
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "crs";
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ── targeting flags (all optional; combine freely) ─────────────────────────
// --status "Liable For Dissolution"           exact match on status.derived
// --status "Liable For Dissolution,Struck"    OR — matches either value
// --since 2026-01-01                          only rows with lastEventDate >= this
// --city Calgary                              case-insensitive exact city match
// --limit-queue 5000                          hard cap on the candidate pool pulled from Mongo
const STATUS       = argVal("--status", null);
const SINCE        = argVal("--since", null);
const CITY         = argVal("--city", null);
const ISSUE_PREFIX = argVal("--issue-prefix", null);   // e.g. "2026/" — the gazette-cohort filter
const LIMIT_QUEUE  = parseInt(argVal("--limit-queue", String(BATCH * 3)), 10);

const UA = "CRS-enrichment/1.0 (+https://www.corporateregistryservices.ca; support@corporateregistryservices.ca)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── helpers ─────────────────────────────────────────────────────────────────
const NUMBERED_RE = /^\d{5,}\s+(ALBERTA|CANADA|ONTARIO|BRITISH COLUMBIA|B\.?C\.?|SASKATCHEWAN|MANITOBA|QUEBEC)\b/i;

function normTokens(s) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLP|LP|ULC|PROFESSIONAL|HOLDINGS?)\b/g, "")
    .split(/\s+/).filter((t) => t.length > 1);
}

function nameSimilarity(a, b) {
  const ta = new Set(normTokens(a)), tb = new Set(normTokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL = /(\.png|\.jpg|\.gif|\.webp|example\.|sentry|wixpress|godaddy|yourdomain|domain\.com|email\.com|@2x)/i;

function extractEmails(html, siteHost) {
  const found = new Map(); // email -> score
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase().replace(/^mailto:/, "");
    if (JUNK_EMAIL.test(email) || email.length > 60) continue;
    const dom = email.split("@")[1];
    let score = 1;
    if (siteHost && (siteHost.endsWith(dom) || dom.endsWith(siteHost.replace(/^www\./, "")))) score += 10;
    if (/^(info|contact|office|admin|hello|inquiries|sales)@/.test(email)) score += 3;
    found.set(email, Math.max(found.get(email) ?? 0, score));
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
}

async function fetchText(url, timeoutMs = 10000) {
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

// ── step 1: Google Places (New) text search ────────────────────────────────
async function placesLookup(name, city, postalCode) {
  if (!PLACES_KEY) return null;
  try {
    /* Include postal code in the query when we have it — narrows Google's
       search to the corp's actual neighbourhood and greatly reduces
       false-positives on generic corp names ("Therapy Place", "Investment
       Corp") that exist in multiple cities. Costs nothing extra. */
    const query = [name, city, postalCode, "Alberta"]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
    });
    if (!res.ok) { console.error("  places HTTP", res.status); return null; }
    const data = await res.json();
    let best = null, bestSim = 0;
    for (const p of data.places ?? []) {
      const sim = nameSimilarity(name, p.displayName?.text ?? "");
      if (sim > bestSim) { bestSim = sim; best = p; }
    }
    if (!best || bestSim < 0.5) return null;  // don't attach the wrong business
    return {
      website: best.websiteUri ?? null,
      phone: best.nationalPhoneNumber ?? null,
      matchedName: best.displayName?.text ?? "",
      similarity: bestSim,
    };
  } catch (e) { console.error("  places error:", e.message); return null; }
}

// ── step 2: crawl site for an email ─────────────────────────────────────────
async function crawlForEmail(website) {
  let base;
  try { base = new URL(website); } catch { return { email: null, sourceUrl: null }; }
  const host = base.host.toLowerCase();
  const paths = ["", "/contact", "/contact-us", "/contactus", "/about", "/about-us"];
  for (const p of paths) {
    const url = p ? new URL(p, base).href : base.href;
    const html = await fetchText(url);
    if (!html) continue;
    const emails = extractEmails(html, host);
    if (emails.length) return { email: emails[0], sourceUrl: url };
    await sleep(400); // polite within one site
  }
  return { email: null, sourceUrl: null };
}

// ── step 3: MX validation ───────────────────────────────────────────────────
async function hasMx(email) {
  const domain = email.split("@")[1];
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch { return false; }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!PLACES_KEY) console.warn("WARN: GOOGLE_PLACES_API_KEY not set — skipping Places, crawl-only mode is near useless without websites.");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const companies = client.db(DB_NAME).collection("companies");

  // Queue: pending, named (not numbered), has a city, freshest first.
  // Optional filters narrow the queue for cost-controlled targeted runs.
  const query = {
    "contact.enrichStatus": "pending",
    "address.city":         { $nin: [null, ""] },
    "outreach.unsubscribed": { $ne: true },
  };

  if (STATUS) {
    const values = STATUS.split(",").map((s) => s.trim()).filter(Boolean);
    query["status.derived"] = values.length === 1 ? values[0] : { $in: values };
  }
  if (SINCE) {
    const sinceDate = new Date(SINCE);
    if (Number.isNaN(sinceDate.getTime())) {
      console.warn(`WARN: --since "${SINCE}" is not a valid date; ignoring.`);
    } else {
      query["status.lastEventDate"] = { $gte: sinceDate };
    }
  }
  if (CITY) {
    // Case-insensitive exact match — Compass stores city with mixed case
    // ("Calgary", "CALGARY", "calgary") depending on OCR era.
    query["address.city"] = { $regex: `^${CITY}$`, $options: "i" };
  }
  if (ISSUE_PREFIX) {
    // "2026/" matches every issue in the 2026 gazette year.
    query["status.lastIssue"] = { $regex: `^${ISSUE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
  }

  const filters = [
    STATUS       ? `status=${STATUS}`         : null,
    SINCE        ? `since=${SINCE}`           : null,
    CITY         ? `city=${CITY}`             : null,
    ISSUE_PREFIX ? `issue=${ISSUE_PREFIX}*`   : null,
  ].filter(Boolean);
  console.log(
    filters.length
      ? `filters applied: ${filters.join(" · ")}`
      : "no filters — using default queue (all pending, any status)",
  );

  const matching = await companies.countDocuments(query);
  console.log(`${matching.toLocaleString()} candidate(s) match; pulling top ${LIMIT_QUEUE.toLocaleString()} by freshest lastEventDate.`);

  const queue = await companies.find(query)
    .sort({ "status.lastEventDate": -1 })
    .limit(LIMIT_QUEUE)
    .toArray();

  const stats = { processed: 0, skippedNumbered: 0, found: 0, phoneOnly: 0, notFound: 0 };

  for (const c of queue) {
    if (stats.processed >= BATCH) break;

    if (NUMBERED_RE.test(c.name)) {
      stats.skippedNumbered++;
      if (!DRY) await companies.updateOne({ _id: c._id },
        { $set: { "contact.enrichStatus": "skip_numbered", "contact.enrichedAt": new Date() } });
      continue;
    }

    stats.processed++;
    console.log(`[${stats.processed}/${BATCH}] ${c.name} (${c.address?.city ?? "?"})`);

    const update = { "contact.enrichedAt": new Date() };
    const place = await placesLookup(c.name, c.address?.city ?? "", c.address?.postal ?? "");

    if (place) {
      if (place.website) update["contact.website"] = place.website;
      if (place.phone) update["contact.phone"] = place.phone;
      console.log(`  places: ${place.matchedName} (sim ${place.similarity.toFixed(2)}) site=${place.website ?? "-"} tel=${place.phone ?? "-"}`);
    }

    let email = null, sourceUrl = null;
    if (place?.website) {
      ({ email, sourceUrl } = await crawlForEmail(place.website));
      if (email && !(await hasMx(email))) {
        console.log(`  MX fail: ${email}`);
        email = null; sourceUrl = null;
      }
    }

    if (email) {
      update["contact.email"] = email;
      update["contact.emailSourceUrl"] = sourceUrl;
      update["contact.enrichStatus"] = "found";
      stats.found++;
      console.log(`  EMAIL: ${email}  (source: ${sourceUrl})`);
    } else if (place?.phone || place?.website) {
      update["contact.enrichStatus"] = "phone_or_web_only";
      stats.phoneOnly++;
    } else {
      update["contact.enrichStatus"] = "not_found";   // → direct-mail channel
      stats.notFound++;
    }

    if (!DRY) await companies.updateOne({ _id: c._id }, { $set: update });
    await sleep(DELAY_MS);
  }

  console.log("\nSummary:", JSON.stringify(stats));
  console.log(DRY ? "(dry run — nothing written)" : "Written back to MongoDB.");
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
