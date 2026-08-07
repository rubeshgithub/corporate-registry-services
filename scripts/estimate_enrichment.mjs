#!/usr/bin/env node
/**
 * Reports what the enrichment queue actually looks like for a targeted slice
 * so you can estimate Google Places API cost + expected email yield before
 * kicking off a big batch.
 *
 * Segments the target on the same rules the enricher applies at runtime:
 *   - Excludes numbered corps (matched by the enricher's NUMBERED_RE — those
 *     are skip_numbered and cost nothing to enrich)
 *   - Requires a non-empty address.city (Places API can't work without a city)
 *   - Excludes already-enriched rows (contact.enrichStatus != "pending")
 *
 * Usage:
 *   node scripts/estimate_enrichment.mjs --status "Incorporated,Registered" --since 2026-01-01
 *   node scripts/estimate_enrichment.mjs --city Calgary --status Incorporated
 *   node scripts/estimate_enrichment.mjs                  # totals for the whole DB
 *
 * Env: MONGODB_URI, DB_NAME (defaults: mongodb://localhost:27017, "crs")
 */

import { MongoClient } from "mongodb";

const args   = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const STATUS       = argVal("--status", null);
const SINCE        = argVal("--since",  null);
const CITY         = argVal("--city",   null);
const ISSUE_PREFIX = argVal("--issue-prefix", null);   // e.g. "2026/" — matches corps whose lastIssue is in a 2026 gazette

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME     = process.env.DB_NAME     ?? "crs";

/* Same regex the enricher uses to skip numbered corps. */
const NUMBERED_RE = /^\d{5,}\s+(ALBERTA|CANADA|ONTARIO|BRITISH COLUMBIA|B\.?C\.?|SASKATCHEWAN|MANITOBA|QUEBEC)\b/i;

/* Assumptions for cost projection — these are §9's real-world numbers plus
   the yield we observed on the first 50-batch. Change here if your batches
   settle at a different rate. */
const PLACES_COST_PER_LOOKUP = 0.02;   // USD
const EMAIL_HIT_RATE         = 0.32;   // 32% found emails on our 50-batch
const PHONE_HIT_RATE         = 0.26;   // 26% found phone but no email

function buildBaseFilter() {
  const q = {};
  if (STATUS) {
    const values = STATUS.split(",").map((s) => s.trim()).filter(Boolean);
    q["status.derived"] = values.length === 1 ? values[0] : { $in: values };
  }
  if (SINCE) {
    const d = new Date(SINCE);
    if (Number.isNaN(d.getTime())) {
      console.warn(`WARN: --since "${SINCE}" is not a valid date; ignoring.`);
    } else {
      q["status.lastEventDate"] = { $gte: d };
    }
  }
  if (CITY) {
    q["address.city"] = { $regex: `^${CITY}$`, $options: "i" };
  }
  if (ISSUE_PREFIX) {
    // Anchor the prefix so "2026/" matches "2026/01_..." but not "12026/..."
    q["status.lastIssue"] = { $regex: `^${ISSUE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
  }
  return q;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const companies = client.db(DB_NAME).collection("companies");

  const base = buildBaseFilter();
  const filters = [
    STATUS       ? `status = ${STATUS}`             : null,
    SINCE        ? `since  = ${SINCE}`              : null,
    CITY         ? `city   = ${CITY}`               : null,
    ISSUE_PREFIX ? `issue  = ${ISSUE_PREFIX}*`      : null,
  ].filter(Boolean);
  console.log(`\n=== Enrichment estimate ===`);
  console.log(filters.length ? `Slice: ${filters.join(" · ")}` : `Slice: entire database`);
  console.log("");

  const totalInSlice = await companies.countDocuments(base);
  const withCity     = await companies.countDocuments({ ...base, "address.city": { $nin: [null, ""] } });
  const withoutCity  = totalInSlice - withCity;

  /* Numbered vs. named — the numbered regex isn't indexable so this needs a
     scan of the with-city subset. Small enough at the 2026 slice size. */
  const namedWithCity = await companies.countDocuments({
    ...base,
    "address.city": { $nin: [null, ""] },
    name: { $not: NUMBERED_RE },
  });
  const numberedWithCity = withCity - namedWithCity;

  const alreadyEnriched = await companies.countDocuments({
    ...base,
    "address.city": { $nin: [null, ""] },
    name: { $not: NUMBERED_RE },
    "contact.enrichStatus": { $ne: "pending" },
  });
  const pendingNamedWithCity = namedWithCity - alreadyEnriched;

  /* Report */
  console.log(`Total in slice:                       ${totalInSlice.toLocaleString()}`);
  console.log(`  – without a city (unreachable):     ${withoutCity.toLocaleString()}`);
  console.log(`  – with a city:                      ${withCity.toLocaleString()}`);
  console.log(`      • numbered (skip_numbered):     ${numberedWithCity.toLocaleString()}`);
  console.log(`      • named:                        ${namedWithCity.toLocaleString()}`);
  console.log(`          – already enriched:         ${alreadyEnriched.toLocaleString()}`);
  console.log(`          – PENDING (queue target):   ${pendingNamedWithCity.toLocaleString()}`);
  console.log("");

  const estCost         = pendingNamedWithCity * PLACES_COST_PER_LOOKUP;
  const expectedEmails  = Math.round(pendingNamedWithCity * EMAIL_HIT_RATE);
  const expectedPhones  = Math.round(pendingNamedWithCity * PHONE_HIT_RATE);
  const expectedReach   = expectedEmails + expectedPhones;
  console.log(`=== Cost / yield projection ===`);
  console.log(`Places API lookups:                   ${pendingNamedWithCity.toLocaleString()}`);
  console.log(`Estimated Places cost (@ $0.02/ea):   $${estCost.toFixed(2)} USD`);
  console.log(`Expected emails (@ 32% hit):          ${expectedEmails.toLocaleString()}`);
  console.log(`Expected phone-only (@ 26% hit):      ${expectedPhones.toLocaleString()}`);
  console.log(`Expected total reachable:             ${expectedReach.toLocaleString()} (${Math.round((expectedReach / pendingNamedWithCity) * 100)}%)`);
  console.log(`Wall time @ 1200ms/corp:              ${Math.round((pendingNamedWithCity * 1.2) / 60)} min`);
  console.log("");

  console.log(`To run this slice:`);
  const runCmd = [
    "node --env-file=web\\.env scripts/enrich_contacts.mjs",
    STATUS       ? `--status "${STATUS}"`         : null,
    SINCE        ? `--since ${SINCE}`             : null,
    CITY         ? `--city ${CITY}`               : null,
    ISSUE_PREFIX ? `--issue-prefix "${ISSUE_PREFIX}"` : null,
    `--batch ${pendingNamedWithCity} --limit-queue ${Math.max(pendingNamedWithCity * 2, 200)}`,
  ].filter(Boolean).join(" ");
  console.log(`  ${runCmd}`);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
