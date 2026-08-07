#!/usr/bin/env node
/**
 * Registrar delta importer — reads `registrar_delta_YYYY-MM-DD.csv` files,
 * writes into MongoDB per ALBERTA-REGISTRY-DATA-PIPELINE.md §6, then moves
 * processed files to data/processed/.
 *
 * Two collections:
 *   events    — append-only, unique index on (issue, corpNumber, companyNameNorm, event)
 *               so replays are no-ops via ordered:false bulk inserts.
 *   companies — upserted only when the incoming eventDate is >= stored
 *               status.lastEventDate. Never overwrites address / contact
 *               with empty values (name-only rows carry no address).
 *
 * Name-only rows (liable-for-dissolution, dissolved/struck-off) have no
 * corp_number. We synth-key them as "name:<NORM>" until a numbered record
 * arrives for the same normalized name — at which point we migrate the
 * enrichment/outreach fields to the corp-numbered document.
 *
 * Usage:
 *   node scripts/import_delta.mjs                              # all pending deltas in data/
 *   node scripts/import_delta.mjs --file data/registrar_delta_2026-07-16.csv
 *   node scripts/import_delta.mjs --dir data/ --archive-dir data/processed/
 *   node scripts/import_delta.mjs --dry-run                    # no writes, no moves
 *   node scripts/import_delta.mjs --ensure-indexes             # just create indexes and exit
 *   node scripts/import_delta.mjs --no-archive                 # import without moving files
 *
 * Env (.env or shell):
 *   MONGODB_URI=mongodb://localhost:27017
 *   DB_NAME=crs
 *
 * Deps: npm i mongodb   (everything else is Node 18+ built-ins)
 */

import { MongoClient } from "mongodb";
import fs   from "node:fs";
import path from "node:path";

/* ── args + config ─────────────────────────────────────────────── */
const args   = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const FILE         = argVal("--file", null);
const DIR          = argVal("--dir", "data");
const PATTERN_RE   = /^registrar_delta_\d{4}-\d{2}-\d{2}\.csv$/i;
const ARCHIVE_DIR  = argVal("--archive-dir", "data/processed");
const DRY          = args.includes("--dry-run");
const NO_ARCHIVE   = args.includes("--no-archive");
const INDEX_ONLY   = args.includes("--ensure-indexes");
const VERBOSE      = args.includes("--verbose");

const MONGODB_URI  = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME      = process.env.DB_NAME ?? "crs";

/* ── helpers ────────────────────────────────────────────────────── */

/** Normalized name — uppercase, strip trailing punctuation, collapse whitespace.
 *  Matches §4 rule 1 so name-only rows can match numbered records. */
function normalizeName(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[.,;:]+$/g, "")     // trailing punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/** Slug for public profile URLs: lowercased hyphenated + corp number suffix. */
function makeSlug(name, corpNumber) {
  const base = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return corpNumber ? `${base}-${corpNumber}` : `name-${base}`;
}

/** Parse a single CSV line respecting double-quoted fields with embedded
 *  commas and doubled-quote escapes. Handles ragged trailing commas. */
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else                     { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === ",")      { out.push(cur); cur = ""; }
      else if (c === '"') { inQuotes = true; }
      else                { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

/** Parse a delta CSV into an array of row objects keyed by header names. */
function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");  // strip BOM
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = (fields[j] ?? "").trim();
    rows.push(row);
  }
  return rows;
}

/** Parse "YYYY-MM-DD" or ISO — return a JS Date or null. */
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Build the mongo docs (events + companies) for a single CSV row.
 *  Returns { eventDoc, companyOp } — companyOp is what we hand to bulkWrite. */
function buildOps(row) {
  const rawName    = row.company_name || "";
  const nameNorm   = normalizeName(rawName);
  if (!nameNorm) return null;   // skip empty rows

  const corpNumber = (row.corp_number || "").trim();
  const eventDate  = parseDate(row.event_date);
  const event      = row.event      || "";
  const section    = row.section    || "";
  const issue      = row.issue      || "";
  const entityType = row.entity_type || "";
  const address    = row.address    || "";
  const city       = row.city       || "";
  const postal     = row.postal_code || "";

  const eventDoc = {
    corpNumber,
    companyNameNorm: nameNorm,
    event, section,
    eventDate,
    issue,
    address, city, postal,
    entityType,
  };

  // Company _id: real corp number if present, otherwise synthetic "name:<NORM>"
  const isNameOnly = !corpNumber;
  const companyId  = isNameOnly ? `name:${nameNorm}` : corpNumber;

  // Fields we always $set (subject to the eventDate freshness check below).
  const setFields = {
    name: rawName,
    nameNorm,
    slug: makeSlug(rawName, corpNumber),
  };
  if (entityType) setFields.entityType = entityType;

  // status.* is guarded — only overwrite when the incoming event is at
  // least as new as what's already stored.
  // We can't do this cleanly in a single updateOne without an aggregation
  // pipeline update, which is what we use below.

  // Address is only kept when non-empty (name-only rows carry no address).
  const addressFields = (address || city || postal) ? {
    "address.full":   address,
    "address.city":   city,
    "address.postal": postal,
  } : null;

  return { eventDoc, companyId, isNameOnly, nameNorm, corpNumber, setFields, addressFields, event, eventDate, issue };
}

/** Return an aggregation-pipeline update that upserts the companies doc,
 *  respecting the "only advance status when incoming is newer" rule. */
function buildCompanyUpdate({ setFields, addressFields, event, eventDate, issue }) {
  // Build the pipeline. In an aggregation update, $set can reference existing
  // field values ("$field") to make the guard conditional.
  const eventDateExpr = eventDate ?? null;

  const pipeline = [
    {
      $set: {
        ...setFields,
        "status.derived": {
          $cond: [
            {
              $or: [
                { $eq: [{ $ifNull: ["$status.lastEventDate", null] }, null] },
                { $lte: [{ $ifNull: ["$status.lastEventDate", null] }, eventDateExpr] },
              ],
            },
            event,
            { $ifNull: ["$status.derived", event] },
          ],
        },
        "status.lastEventDate": {
          $cond: [
            {
              $or: [
                { $eq: [{ $ifNull: ["$status.lastEventDate", null] }, null] },
                { $lte: [{ $ifNull: ["$status.lastEventDate", null] }, eventDateExpr] },
              ],
            },
            eventDateExpr,
            "$status.lastEventDate",
          ],
        },
        "status.lastIssue": {
          $cond: [
            {
              $or: [
                { $eq: [{ $ifNull: ["$status.lastEventDate", null] }, null] },
                { $lte: [{ $ifNull: ["$status.lastEventDate", null] }, eventDateExpr] },
              ],
            },
            issue,
            "$status.lastIssue",
          ],
        },
        // Initialize the live-check + contact + outreach subdocs the first
        // time we see this company; subsequent updates leave them alone.
        "status.live":          { $ifNull: ["$status.live",         null] },
        "status.liveCheckedAt": { $ifNull: ["$status.liveCheckedAt", null] },
        contact:                { $ifNull: ["$contact", {
          email: null, emailSourceUrl: null,
          website: null, phone: null,
          enrichedAt: null, enrichStatus: "pending",
        }] },
        outreach:               { $ifNull: ["$outreach", {
          lastEmailAt: null, sequenceStep: 0, replied: false, orderId: null,
        }] },
      },
    },
  ];

  // Address is stored only when we have it. Aggregation update handles
  // "don't touch existing fields when incoming is empty" naturally by not
  // referencing them.
  if (addressFields) {
    pipeline[0].$set = { ...pipeline[0].$set, address: {
      full:   addressFields["address.full"],
      city:   addressFields["address.city"],
      postal: addressFields["address.postal"],
    } };
  }

  return pipeline;
}

/* ── index helpers ─────────────────────────────────────────────── */

async function ensureIndexes(db) {
  const events    = db.collection("events");
  const companies = db.collection("companies");

  await events.createIndex(
    { issue: 1, corpNumber: 1, companyNameNorm: 1, event: 1 },
    { unique: true, name: "uniq_event_replay" },
  );
  await events.createIndex({ corpNumber: 1, eventDate: -1 }, { name: "corp_timeline" });
  await events.createIndex({ event: 1, eventDate: -1 }, { name: "event_watchlist" });

  await companies.createIndex({ nameNorm: 1 }, { name: "name_norm" });
  await companies.createIndex({ "address.city": 1, "status.derived": 1 }, { name: "city_status" });
  await companies.createIndex({ "status.derived": 1, "status.lastEventDate": -1 }, { name: "status_recent" });
  await companies.createIndex({ slug: 1 }, { unique: true, name: "slug_unique", sparse: true });
  await companies.createIndex({ "contact.enrichStatus": 1 }, { name: "enrich_queue" });

  // Text index for company-search — createIndex is idempotent, but a name
  // conflict throws if a differently-configured text index exists. Wrap
  // in try/catch so re-runs don't blow up mid-pipeline.
  try {
    await companies.createIndex({ name: "text" }, { name: "name_text", default_language: "english" });
  } catch (e) {
    if (e?.code !== 85 && e?.code !== 86) throw e; // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
  }
}

/* ── delta processing ──────────────────────────────────────────── */

async function importFile(db, filePath) {
  const stats = { rows: 0, skipped: 0, events: 0, companies: 0, errors: 0 };
  const rows = parseCsvFile(filePath);
  stats.rows = rows.length;
  if (VERBOSE) console.log(`  parsed ${rows.length} rows`);

  // 1. Events — bulk insert with ordered:false so dup-key errors on
  //    replays don't abort the batch. We collect them into ~2000-row
  //    chunks to keep memory + wire size bounded.
  const CHUNK = 2000;
  const eventDocs = [];
  const companyOpsList = [];
  for (const r of rows) {
    const ops = buildOps(r);
    if (!ops) { stats.skipped++; continue; }
    eventDocs.push(ops.eventDoc);
    companyOpsList.push(ops);
  }

  if (!DRY) {
    const events = db.collection("events");
    for (let i = 0; i < eventDocs.length; i += CHUNK) {
      const chunk = eventDocs.slice(i, i + CHUNK);
      try {
        const res = await events.insertMany(chunk, { ordered: false });
        stats.events += res.insertedCount ?? 0;
      } catch (e) {
        // BulkWriteError: some docs succeed, dupes fail — count what got in.
        stats.events += e?.result?.nInserted ?? e?.result?.insertedCount ?? 0;
        const nonDupErrs = (e?.writeErrors ?? []).filter((w) => w.code !== 11000).length;
        stats.errors += nonDupErrs;
        if (nonDupErrs && VERBOSE) console.warn(`    ${nonDupErrs} non-duplicate event errors`);
      }
    }

    // 2. Companies — one guarded upsert per row (with name→corp merge check).
    //    Sequential for clarity; delta files are small (thousands of rows).
    for (const ops of companyOpsList) {
      try {
        await importCompanyRow(db, ops);
        stats.companies++;
      } catch (e) {
        stats.errors++;
        if (VERBOSE) console.warn(`    company upsert failed for ${ops.companyId}: ${e.message}`);
      }
    }
  } else {
    stats.events    = eventDocs.length;
    stats.companies = companyOpsList.length;
  }

  return stats;
}

// Extracted for readability — same body as the merge+upsert in importRow().
async function importCompanyRow(db, ops) {
  const companies = db.collection("companies");
  if (!ops.isNameOnly) {
    const nameOnlyId = `name:${ops.nameNorm}`;
    const nameOnlyDoc = await companies.findOne({ _id: nameOnlyId });
    if (nameOnlyDoc) {
      const migrated = {};
      if (nameOnlyDoc.contact)  migrated.contact  = nameOnlyDoc.contact;
      if (nameOnlyDoc.outreach) migrated.outreach = nameOnlyDoc.outreach;
      if (Object.keys(migrated).length) {
        await companies.updateOne(
          { _id: ops.companyId },
          { $set: migrated },
          { upsert: true },
        );
      }
      await companies.deleteOne({ _id: nameOnlyId });
    }
  }
  const pipeline = buildCompanyUpdate(ops);
  await companies.updateOne({ _id: ops.companyId }, pipeline, { upsert: true });
}

/* ── file discovery + archiving ────────────────────────────────── */

function findDeltaFiles() {
  if (FILE) return [FILE];
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => PATTERN_RE.test(f))
    .sort()   // lexicographic on the ISO date suffix = chronological
    .map((f) => path.join(DIR, f));
}

function archiveFile(filePath) {
  if (DRY || NO_ARCHIVE) return;
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const dest = path.join(ARCHIVE_DIR, path.basename(filePath));
  fs.renameSync(filePath, dest);
  if (VERBOSE) console.log(`  archived → ${dest}`);
}

/* ── main ──────────────────────────────────────────────────────── */

async function main() {
  // --dry-run skips the DB entirely so you can validate CSV parsing without
  // a live Mongo instance. Everything else needs a real connection.
  let client = null, db = null;
  if (!DRY) {
    client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`connected to ${DB_NAME} @ ${MONGODB_URI.replace(/\/\/[^@]*@/, "//<creds>@")}`);
  } else {
    console.log("dry-run: no Mongo connection; parse-only");
  }

  try {
    if (!DRY) {
      console.log("ensuring indexes…");
      await ensureIndexes(db);
      if (INDEX_ONLY) { console.log("indexes done — exiting (--ensure-indexes)"); return; }
    } else if (INDEX_ONLY) {
      console.log("--ensure-indexes ignored under --dry-run");
    }

    const files = findDeltaFiles();
    if (!files.length) {
      console.log(`no matching delta files in ${FILE ?? DIR}`);
      return;
    }
    console.log(`found ${files.length} delta file(s)${DRY ? " (dry-run)" : ""}`);

    const overall = { files: 0, rows: 0, skipped: 0, events: 0, companies: 0, errors: 0 };
    for (const f of files) {
      console.log(`▸ ${f}`);
      const s = await importFile(db, f);
      console.log(`  rows ${s.rows} · events +${s.events} · companies +${s.companies} · skipped ${s.skipped} · errors ${s.errors}`);
      archiveFile(f);
      overall.files++;
      for (const k of Object.keys(s)) overall[k] += s[k];
    }
    console.log(`done — ${overall.files} file(s) · events +${overall.events} · companies +${overall.companies} · errors ${overall.errors}`);
  } finally {
    if (client) await client.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
