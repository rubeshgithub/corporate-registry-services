#!/usr/bin/env node
/**
 * One-time bulk loader for the registrar_companies.csv master (~1.5M rows).
 * Streams the CSV line-by-line, builds companies docs matching the schema
 * in ALBERTA-REGISTRY-DATA-PIPELINE.md §6, and inserts them in 5K-row
 * bulk chunks with `ordered: false`.
 *
 * Duplicate-key errors from re-runs are counted and ignored — safe to
 * re-invoke on a partially-loaded collection.
 *
 * Companies get initialized with:
 *   status.derived         = derived_status from CSV
 *   status.lastEventDate   = parsed last_event_date
 *   status.lastIssue       = last_issue
 *   status.live / liveCheckedAt = null (populated by live-check code later)
 *   contact.*              = null / enrichStatus: "pending"
 *   outreach.*             = null / sequenceStep: 0
 *
 * After bulk load, the delta importer (import_delta.mjs) will keep the
 * collection fresh via twice-monthly gazette drops.
 *
 * Usage:
 *   node scripts/bulk_load_master.mjs                                # loads data/registrar_companies.csv
 *   node scripts/bulk_load_master.mjs --file data/other_master.csv
 *   node scripts/bulk_load_master.mjs --dry-run                      # no DB writes
 *   node scripts/bulk_load_master.mjs --limit 10000                  # cap for quick test
 *   node scripts/bulk_load_master.mjs --chunk 2000                   # smaller bulk chunks
 *   node scripts/bulk_load_master.mjs --ensure-indexes               # just indexes, no load
 *
 * Env:
 *   MONGODB_URI (defaults to mongodb://localhost:27017)
 *   DB_NAME     (defaults to "crs")
 */

import { MongoClient } from "mongodb";
import fs   from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createInterface }  from "node:readline";

/* ── args + config ─────────────────────────────────────────────── */
const args   = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const FILE       = argVal("--file", "data/registrar_companies.csv");
const DRY        = args.includes("--dry-run");
const INDEX_ONLY = args.includes("--ensure-indexes");
const LIMIT      = parseInt(argVal("--limit", "0"), 10) || 0;   // 0 = no limit
const CHUNK      = parseInt(argVal("--chunk", "5000"), 10);
const LOG_EVERY  = parseInt(argVal("--log-every", "50000"), 10);

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME     = process.env.DB_NAME ?? "crs";

/* ── shared helpers (duplicated from import_delta.mjs for self-containment) ─ */

function normalizeName(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSlug(name, corpNumber) {
  const base = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return corpNumber ? `${base}-${corpNumber}` : `name-${base}`;
}

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

/** Parse gazette dates like "2005 DEC 08" → JS Date. Falls back to Date().
 *  Returns null on failure so the caller can decide whether to keep the row. */
const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3,  MAY: 4,  JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, SEPT: 8, OCT: 9,  NOV: 10, DEC: 11,
};
function parseGazetteDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})$/);
  if (m) {
    const [, y, monRaw, d] = m;
    const mo = MONTH_MAP[monRaw.toUpperCase()];
    if (mo === undefined) return null;
    return new Date(Date.UTC(+y, mo, +d));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ── doc builder ───────────────────────────────────────────────── */

/** Build a companies doc from a master-CSV row. Returns null on unparseable
 *  rows so streaming can skip them without aborting. */
function buildCompanyDoc(row) {
  const rawName  = (row.company_name || "").trim();
  const nameNorm = normalizeName(rawName);
  if (!nameNorm) return null;

  const corpNumber = (row.corp_number || "").trim();
  const isNameOnly = !corpNumber;
  const _id = isNameOnly ? `name:${nameNorm}` : corpNumber;

  const eventDate = parseGazetteDate(row.last_event_date);
  const address   = (row.address     || "").trim();
  const city      = (row.city        || "").trim();
  const postal    = (row.postal_code || "").trim();

  const doc = {
    _id,
    name:       rawName,
    nameNorm,
    entityType: (row.entity_type || "").trim(),
    slug:       makeSlug(rawName, corpNumber),
    status: {
      derived:        (row.derived_status || "").trim(),
      lastEventDate:  eventDate,
      lastIssue:      (row.last_issue || "").trim(),
      live:           null,
      liveCheckedAt:  null,
    },
    contact: {
      email:          null,
      emailSourceUrl: null,
      website:        null,
      phone:          null,
      enrichedAt:     null,
      enrichStatus:   "pending",
    },
    outreach: {
      lastEmailAt:    null,
      sequenceStep:   0,
      replied:        false,
      orderId:        null,
    },
  };

  // Only attach address when we have something — name-only rows will be
  // rare in the master, but if they appear, don't stamp them with an
  // empty address subdoc.
  if (address || city || postal) {
    doc.address = { full: address, city, postal };
  }

  return doc;
}

/* ── index helpers ─────────────────────────────────────────────── */

async function ensureIndexes(db) {
  const companies = db.collection("companies");

  await companies.createIndex({ nameNorm: 1 }, { name: "name_norm" });
  await companies.createIndex({ "address.city": 1, "status.derived": 1 }, { name: "city_status" });
  await companies.createIndex({ "status.derived": 1, "status.lastEventDate": -1 }, { name: "status_recent" });
  await companies.createIndex({ slug: 1 }, { unique: true, name: "slug_unique", sparse: true });
  await companies.createIndex({ "contact.enrichStatus": 1 }, { name: "enrich_queue" });

  try {
    await companies.createIndex({ name: "text" }, { name: "name_text", default_language: "english" });
  } catch (e) {
    if (e?.code !== 85 && e?.code !== 86) throw e;
  }
}

/* ── streaming loader ──────────────────────────────────────────── */

async function loadFile(db, filePath) {
  const stats = {
    parsed:     0,
    skipped:    0,
    inserted:   0,
    duplicates: 0,
    errors:     0,
  };

  const collection = DRY ? null : db.collection("companies");
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let header = null;
  let buf = [];
  let lastLoggedAt = Date.now();
  const startedAt = Date.now();

  let consecutiveSilentDrops = 0;
  const MAX_SILENT_DROPS = 3;

  async function flush() {
    if (!buf.length) return;
    if (!DRY) {
      const chunkSize = buf.length;
      let insertedThisChunk = 0;
      let dupsThisChunk     = 0;
      let otherThisChunk    = 0;
      let errorKind         = null;
      try {
        const res = await collection.insertMany(buf, { ordered: false });
        insertedThisChunk = res.insertedCount ?? 0;
      } catch (e) {
        errorKind = e?.name ?? e?.constructor?.name ?? "UnknownError";
        insertedThisChunk = e?.result?.insertedCount ?? e?.insertedCount ?? 0;
        const writeErrs   = e?.writeErrors ?? e?.result?.writeErrors ?? [];
        dupsThisChunk  = writeErrs.filter((w) => w.code === 11000).length;
        otherThisChunk = writeErrs.length - dupsThisChunk;
        if (otherThisChunk) {
          console.warn(`    ${otherThisChunk} non-duplicate errors in chunk (${writeErrs.slice(0, 2).map((w) => w.errmsg?.slice(0, 120)).join(" | ")})`);
        }
        // If no writeErrors array either, log the whole error class + message
        if (!writeErrs.length) {
          console.warn(`    ${errorKind}: ${(e?.message ?? "").slice(0, 220)}`);
        }
      }
      stats.inserted   += insertedThisChunk;
      stats.duplicates += dupsThisChunk;
      stats.errors     += otherThisChunk;

      // Silent-drop guard: chunk sent, no inserts, no accounted errors.
      // Usually means the cluster ran out of storage (M0 512 MB cap) or the
      // driver lost the connection mid-batch and we got a swallowed error.
      const accounted = insertedThisChunk + dupsThisChunk + otherThisChunk;
      if (accounted === 0) {
        consecutiveSilentDrops++;
        console.warn(`    SILENT DROP: chunk of ${chunkSize} accounted for 0 docs (${errorKind ?? "no error thrown"}). Streak: ${consecutiveSilentDrops}/${MAX_SILENT_DROPS}`);
        if (consecutiveSilentDrops >= MAX_SILENT_DROPS) {
          throw new Error(
            `Aborting after ${MAX_SILENT_DROPS} consecutive silent-drop chunks. ` +
            `Likely causes: Atlas storage cap (M0=512MB), lost connection, or write concern issue. ` +
            `Check cluster storage in Atlas UI or run against a larger tier / local Docker Mongo.`,
          );
        }
      } else {
        consecutiveSilentDrops = 0;
      }
    } else {
      stats.inserted += buf.length;
    }
    buf = [];
  }

  for await (const line of rl) {
    if (!line) continue;
    if (header === null) {
      header = parseCsvLine(line).map((h) => h.trim());
      continue;
    }
    if (LIMIT && stats.parsed >= LIMIT) break;
    stats.parsed++;

    const fields = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = (fields[i] ?? "").trim();

    const doc = buildCompanyDoc(row);
    if (!doc) { stats.skipped++; continue; }

    buf.push(doc);
    if (buf.length >= CHUNK) await flush();

    if (stats.parsed % LOG_EVERY === 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate    = Math.round(stats.parsed / elapsed);
      console.log(`  ${stats.parsed.toLocaleString()} rows · ${stats.inserted.toLocaleString()} inserted · ${stats.duplicates} dup · ${rate.toLocaleString()}/s`);
      lastLoggedAt = Date.now();
    }
  }
  await flush();

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`  final: parsed ${stats.parsed.toLocaleString()} · inserted ${stats.inserted.toLocaleString()} · dup ${stats.duplicates.toLocaleString()} · skipped ${stats.skipped} · errors ${stats.errors} · ${totalSec}s`);
  return stats;
}

/* ── main ──────────────────────────────────────────────────────── */

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`file not found: ${FILE}`);
    process.exit(2);
  }

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

    console.log(`▸ ${FILE}${LIMIT ? ` (limit ${LIMIT.toLocaleString()})` : ""}${DRY ? " (dry-run)" : ""} · chunk ${CHUNK.toLocaleString()}`);
    await loadFile(db, FILE);
  } finally {
    if (client) await client.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
