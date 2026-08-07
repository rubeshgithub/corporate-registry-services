#!/usr/bin/env node
/**
 * Saskatchewan Gazette (Part I, Corporate Registry Notices) importer.
 *
 * Consumes the CSV produced by scripts/parse_sk_gazette.py and writes to the
 * same two collections as the Alberta importer (events + companies), with
 * the same guarded-upsert semantics. Differences from Alberta, on purpose:
 *
 *   - province: "SK" is stamped on every event and company doc.
 *   - companies _id is prefixed ("sk:<corpNumber>" / "skname:<NORM>") so SK
 *     numbers can never collide with Alberta corp numbers or name-shells.
 *   - SK notices carry no corp number for NAMED companies — those live as
 *     "skname:<NORM>" docs permanently (matching downstream is by name).
 *   - businessType ("Main Type of Business" — SK-only goodness) is stored on
 *     both event and company.
 *
 * Usage:
 *   node scripts/import_sk_gazette.mjs --csv data/sk_gazette_events.csv
 *   node scripts/import_sk_gazette.mjs --csv ... --dry-run
 *   node scripts/import_sk_gazette.mjs --csv ... --verbose
 *
 * Env: MONGODB_URI, DB_NAME (defaults: mongodb://localhost:27017, "crs")
 */

import { MongoClient } from "mongodb";
import fs from "node:fs";

/* ── args + config ─────────────────────────────────────────────── */
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const CSV_PATH   = argVal("--csv", "data/sk_gazette_events.csv");
const DRY        = args.includes("--dry-run");
const VERBOSE    = args.includes("--verbose");
const BULK_CHUNK = parseInt(argVal("--bulk-chunk", "500"), 10);

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME     = process.env.DB_NAME ?? "crs";

/* ── helpers (mirrors import_registrar.mjs) ────────────────────── */

function normalizeName(s) {
  return String(s ?? "").toUpperCase().replace(/[.,;:]+$/g, "").replace(/\s+/g, " ").trim();
}

function makeSlug(name, corpNumber) {
  const base = String(name ?? "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return corpNumber ? `${base}-sk${corpNumber}` : `sk-name-${base}`;
}

/** Minimal RFC-4180 CSV reader (handles quoted fields + escaped quotes). */
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const SECTION_KEY = [
  [/incorporation/i, "registrations"],
  [/registration|renewal/i, "registrations"],
  [/amalgamation/i, "amalgamations"],
  [/continuance/i, "registrations"],
  [/amendment/i, "name_changes"],
  [/discontinuance/i, "discontinued"],
  [/dissolution/i, "struck"],
  [/revival|restoration/i, "revived"],
];

function sectionKey(sectionTitle, event) {
  if (/^Renamed/.test(event)) return "name_changes";
  for (const [rx, key] of SECTION_KEY) if (rx.test(sectionTitle)) return key;
  return "other";
}

const RENAMED_RE = /^Renamed \(now: (.+)\)$/;

function toEvent(row) {
  const name = row.company_name.trim();
  if (!name) return null;
  const eventDate = row.event_date && /^\d{4}-\d{2}-\d{2}$/.test(row.event_date)
    ? new Date(row.event_date + "T00:00:00Z") : null;
  const im = row.issue.match(/G1_(\d{4}-\d{2}-\d{2})/);
  const issueDate = im ? new Date(im[1] + "T00:00:00Z") : null;

  let event = row.event;
  let finalName = name, oldName = null;
  const rm = RENAMED_RE.exec(event);
  if (rm) {
    event = "Renamed";
    finalName = rm[1].trim();
    oldName = name;
  }

  return {
    corpNumber: row.corp_number.trim(),
    name: finalName,
    nameNorm: normalizeName(finalName),
    entityType: row.entity_type,
    businessType: row.business_type,
    event,
    section: sectionKey(row.section, row.event),
    eventDate, issue: `sk/${row.issue}`, issueDate,
    address: row.address, city: row.city, postal: row.postal_code,
    detail: row.detail,
    ...(oldName ? { oldName, oldNameNorm: normalizeName(oldName) } : {}),
  };
}

/* ── writers (guarded upserts, same shape as Alberta) ──────────── */

async function writeEvents(db, events, stats) {
  const docs = events.map((e) => ({
    corpNumber: e.corpNumber, companyNameNorm: e.nameNorm,
    event: e.event, section: e.section,
    eventDate: e.eventDate, issue: e.issue, issueDate: e.issueDate,
    address: e.address, city: e.city, postal: e.postal,
    entityType: e.entityType, businessType: e.businessType,
    province: "SK",
    ...(e.detail ? { detail: e.detail } : {}),
    ...(e.oldName ? { oldName: e.oldName, oldNameNorm: e.oldNameNorm } : {}),
  }));
  for (let i = 0; i < docs.length; i += 2000) {
    const chunk = docs.slice(i, i + 2000);
    try {
      const res = await db.collection("events").insertMany(chunk, { ordered: false });
      stats.eventsInserted += res.insertedCount ?? 0;
    } catch (e) {
      stats.eventsInserted += e?.result?.insertedCount ?? 0;
      const we = e?.writeErrors ?? e?.result?.writeErrors ?? [];
      stats.eventsDup += we.filter((w) => w.code === 11000).length;
      stats.eventsErrors += we.filter((w) => w.code !== 11000).length;
    }
  }
}

function buildCompanyUpdate(e) {
  const dateExpr = e.eventDate ?? null;
  const guard = {
    $or: [
      { $eq: [{ $ifNull: ["$status.lastEventDate", null] }, null] },
      { $lte: [{ $ifNull: ["$status.lastEventDate", null] }, dateExpr] },
    ],
  };
  const set = {
    name: e.name, nameNorm: e.nameNorm,
    slug: makeSlug(e.name, e.corpNumber),
    province: "SK",
    "status.derived":       { $cond: [guard, e.event, { $ifNull: ["$status.derived", e.event] }] },
    "status.lastEventDate": { $cond: [guard, dateExpr, "$status.lastEventDate"] },
    "status.lastIssue":     { $cond: [guard, e.issue, "$status.lastIssue"] },
    "status.lastIssueDate": { $cond: [guard, e.issueDate, "$status.lastIssueDate"] },
    "status.live":          { $ifNull: ["$status.live", null] },
    "status.liveCheckedAt": { $ifNull: ["$status.liveCheckedAt", null] },
    contact: { $ifNull: ["$contact", {
      email: null, emailSourceUrl: null, website: null, phone: null,
      enrichedAt: null, enrichStatus: "pending",
    }]},
    outreach: { $ifNull: ["$outreach", {
      lastEmailAt: null, sequenceStep: 0, replied: false, orderId: null,
    }]},
  };
  if (e.entityType)  set.entityType   = e.entityType;
  if (e.businessType) set.businessType = e.businessType;
  const pipeline = [{ $set: set }];
  if (e.address || e.city || e.postal) {
    pipeline[0].$set.address = { full: e.address || "", city: e.city || "", postal: e.postal || "" };
  }
  return pipeline;
}

async function upsertCompanies(db, events, stats) {
  const ops = events.map((e) => ({
    updateOne: {
      filter: { _id: e.corpNumber ? `sk:${e.corpNumber}` : `skname:${e.nameNorm}` },
      update: buildCompanyUpdate(e),
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    try {
      const res = await db.collection("companies").bulkWrite(ops.slice(i, i + BULK_CHUNK), { ordered: false });
      stats.companiesUpserted += (res.upsertedCount ?? 0) + (res.matchedCount ?? 0);
    } catch (err) {
      stats.companiesUpserted += (err.result?.upsertedCount ?? 0) + (err.result?.matchedCount ?? 0);
      const we = err?.writeErrors ?? err?.result?.writeErrors ?? [];
      stats.companiesErrors += we.length;
      if (we.length && VERBOSE) {
        console.warn(`  ${we.length} bulkWrite errors (${we.slice(0, 2).map((w) => w.errmsg?.slice(0, 100)).join(" | ")})`);
      }
    }
  }
}

/* ── main ──────────────────────────────────────────────────────── */

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH} — run scripts/parse_sk_gazette.py first`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf-8"));
  const events = rows.map(toEvent).filter(Boolean);
  console.log(`${rows.length} CSV rows -> ${events.length} events`);

  const bySection = {};
  for (const e of events) bySection[e.section] = (bySection[e.section] ?? 0) + 1;
  console.log("sections:", Object.entries(bySection).map(([k, v]) => `${k}:${v}`).join(" "));

  if (DRY) { console.log("dry-run: no writes"); return; }

  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`connected to ${DB_NAME} @ ${MONGODB_URI.replace(/\/\/[^@]*@/, "//<creds>@")}`);

  const stats = { eventsInserted: 0, eventsDup: 0, eventsErrors: 0, companiesUpserted: 0, companiesErrors: 0 };
  const t0 = Date.now();
  try {
    /* Reuse the indexes created by import_registrar.mjs (same collections).
       The unique (issue, corpNumber, companyNameNorm, event) index makes
       replays of this importer no-ops too, since issue is "sk/G1_...". */
    await upsertIndexesIfMissing(db);
    await writeEvents(db, events, stats);
    await upsertCompanies(db, events, stats);
  } finally {
    await client.close();
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  events inserted:    ${stats.eventsInserted.toLocaleString()}`);
  console.log(`  events dup:         ${stats.eventsDup.toLocaleString()}`);
  console.log(`  events errored:     ${stats.eventsErrors}`);
  console.log(`  companies upserted: ${stats.companiesUpserted.toLocaleString()}`);
  console.log(`  companies errored:  ${stats.companiesErrors}`);
}

async function upsertIndexesIfMissing(db) {
  await db.collection("events").createIndex(
    { issue: 1, corpNumber: 1, companyNameNorm: 1, event: 1 },
    { unique: true, name: "uniq_event_replay" },
  );
  await db.collection("companies").createIndex({ nameNorm: 1 }, { name: "name_norm" });
  await db.collection("companies").createIndex({ province: 1, "status.derived": 1 }, { name: "province_status" });
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
