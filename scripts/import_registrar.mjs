#!/usr/bin/env node
/**
 * Alberta Registrar's Periodical importer — one unified script that
 * replaces the Python parser + CSV middleman + bulk_load / import_delta
 * chain with a single Node pipeline that reads .cfm files directly and
 * writes to Mongo.
 *
 * Sections handled per issue:
 *   1. Corporate Registrations, Incorporations, and Continuations
 *   2. Corporate Name Changes
 *   3. Certificates of Intent to Dissolve
 *   4. Corporations Liable for Dissolution / Strike-Off / Cancellation
 *   5. Corporations Dissolved / Struck-Off / Registration Cancelled
 *   6. Corporations Revived / Reinstated / Restored
 *   7. Notices of Amalgamation (multi-line block format)
 *
 * Two collections:
 *   events    — append-only event log; unique compound index on
 *               (issue, corpNumber, companyNameNorm, event) makes replays no-ops
 *   companies — one doc per corp, keyed by corp number (or "name:<NORM>" for
 *               name-only rows until a numbered record turns up and merges).
 *               status.derived / lastEventDate / lastIssue only advance when
 *               the incoming event is at least as new as what's stored.
 *
 * Usage:
 *   node scripts/import_registrar.mjs --all                       # every file, chronological
 *   node scripts/import_registrar.mjs --year 2026                 # one year
 *   node scripts/import_registrar.mjs --file <path>               # single file (delta mode)
 *   node scripts/import_registrar.mjs --dry-run --year 2026       # parse + count, no writes
 *   node scripts/import_registrar.mjs --all --drop-first          # blow away DB first (dangerous!)
 *   node scripts/import_registrar.mjs --ensure-indexes            # just create indexes and exit
 *   node scripts/import_registrar.mjs --verbose                   # per-file stats
 *
 * Env: MONGODB_URI, DB_NAME (defaults: mongodb://localhost:27017, "crs")
 */

import { MongoClient } from "mongodb";
import fs   from "node:fs";
import path from "node:path";

/* ── args + config ─────────────────────────────────────────────── */
const args   = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const ALL         = args.includes("--all");
const YEAR        = argVal("--year", null);
const FILE        = argVal("--file", null);
const ROOT        = argVal("--root", "data/registrar");
const DRY         = args.includes("--dry-run");
const DROP_FIRST  = args.includes("--drop-first");
const INDEX_ONLY  = args.includes("--ensure-indexes");
const VERBOSE     = args.includes("--verbose");
/* By default we skip the name-only shell merge for speed — it does one
 * extra findOne per event which is fine at delta scale (a few thousand)
 * but crushes throughput at initial-load scale (millions). Pass
 * --merge-shells for the delta mode. */
const MERGE_SHELLS = args.includes("--merge-shells");
const BULK_CHUNK   = parseInt(argVal("--bulk-chunk", "500"), 10);

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME     = process.env.DB_NAME     ?? "crs";

/* ── shared helpers ────────────────────────────────────────────── */

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

const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3,  MAY: 4,  JUN: 5,   JUNE: 5,
  JUL: 6, JULY: 6, AUG: 7, SEP: 8, SEPT: 8, SEPTEMBER: 8,
  OCT: 9, NOV: 10, DEC: 11,
};

function parseGazetteDate(year, monRaw, day) {
  const mo = MONTH_MAP[String(monRaw).toUpperCase()];
  if (mo === undefined) return null;
  const d = new Date(Date.UTC(+year, mo, +day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAddress(raw) {
  const full = raw.trim();
  const postalRe = /([A-Z]\d[A-Z])\s?(\d[A-Z]\d)/i;
  const pm = full.match(postalRe);
  const postal = pm ? (pm[1] + pm[2]).toUpperCase() : "";

  /* City: last comma-separated segment usually reads "<CITY> ALBERTA" (or
     another province name). Strip trailing postal + province to isolate. */
  let rest = full;
  if (pm) rest = rest.slice(0, pm.index).replace(/,\s*$/, "").trim();
  const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
  let city = "";
  if (parts.length) {
    const last = parts[parts.length - 1];
    const cm = last.match(/^(.+?)\s+(ALBERTA|BRITISH COLUMBIA|B\.?C\.?|SASKATCHEWAN|MANITOBA|ONTARIO|QUEBEC|NEW BRUNSWICK|NOVA SCOTIA|PRINCE EDWARD ISLAND|NEWFOUNDLAND|YUKON|NORTHWEST TERRITORIES|NUNAVUT)$/i);
    city = titleCase((cm ? cm[1] : last).trim());
  }
  return { full, city, postal };
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

const KNOWN_ENTITY_TYPES = [
  "Numbered Alberta Corporation",
  "Named Alberta Corporation",
  "Other Prov/Territory Corps",
  "Federal Corporation",
  "Medical Professional Corporation",
  "Legal Professional Corporation",
  "Dental Professional Corporation",
  "Chiropractic Professional Corporation",
  "Optometric Professional Corporation",
  "Veterinary Professional Corporation",
  "Engineering Professional Corporation",
  "Alberta Business Corporation",
  "Alberta Society",
  "Alberta Cooperative",
  "Alberta Credit Union",
  "Alberta Corporation",
  "Cemetery Company",
  "Foreign Corporation",
  "Religious Society",
  "Rural Utility",
  "Professional Corporation",
];

function splitNameAndType(nameAndType) {
  for (const t of KNOWN_ENTITY_TYPES) {
    if (nameAndType.endsWith(" " + t)) {
      return { name: nameAndType.slice(0, -(t.length + 1)).trim(), entityType: t };
    }
  }
  /* Fallback: assume the last 2 tokens are the entity type. Better than losing
     the row entirely on an unknown type. */
  const tokens = nameAndType.trim().split(/\s+/);
  if (tokens.length < 2) return { name: nameAndType.trim(), entityType: "" };
  return {
    name:       tokens.slice(0, -2).join(" ").trim(),
    entityType: tokens.slice(-2).join(" ").trim(),
  };
}

/* ── file discovery ────────────────────────────────────────────── */

function issueFromPath(fpath) {
  const parts = fpath.split(/[\\/]/);
  const year  = parts[parts.length - 2];
  const name  = parts[parts.length - 1].replace(/\.cfm$/i, "");
  return `${year}/${name}`;
}

function issueDateFromPath(fpath) {
  const parts = fpath.split(/[\\/]/);
  const year  = parts[parts.length - 2];
  const name  = parts[parts.length - 1];
  const m = name.match(/^\d+_([A-Za-z]+?)(\d{1,2})_Registrar\.cfm$/i);
  if (!m) return null;
  const [, monRaw, day] = m;
  return parseGazetteDate(year, monRaw, day);
}

function discoverFiles() {
  if (FILE) return [FILE];
  if (!fs.existsSync(ROOT)) return [];
  const dirs = YEAR ? [YEAR] : fs.readdirSync(ROOT).sort();
  const files = [];
  for (const dir of dirs) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;
    for (const f of fs.readdirSync(dirPath).sort()) {
      if (f.toLowerCase().endsWith(".cfm")) files.push(path.join(dirPath, f));
    }
  }
  return files;
}

/* ── section detection ─────────────────────────────────────────── */

const SECTION_PATTERNS = [
  { key: "registrations",   pattern: /^Corporate Registrations, Incorporations, and Continuations$/i },
  { key: "name_changes",    pattern: /^Corporate Name Changes$/i },
  { key: "intent_dissolve", pattern: /^Certificate of Intent to Dissolve$/i },
  { key: "liable",          pattern: /^Corporations Liable for Dissolution/i },
  { key: "struck",          pattern: /^Corporations Dissolved\/Struck Off/i },
  { key: "revived",         pattern: /^Corporations Revived\/Reinstated/i },
  { key: "amalgamations",   pattern: /^Notices of Amalgamation$/i },
];

function detectSection(line) {
  const trimmed = line.trim();
  for (const s of SECTION_PATTERNS) {
    if (s.pattern.test(trimmed)) return s.key;
  }
  return null;
}

/* ── line parsers per section ──────────────────────────────────── */

/** Section 1: registrations / incorporations / continuations */
function parseRegistrationLine(line, issue, issueDate) {
  const m = line.match(/^(.+?)\s+(Incorporated|Registered|Continued)\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\s+Registered Address:\s+(.+?)\.\s+No:\s+(\d+)\.\s*$/);
  if (!m) return null;
  const [, nameAndType, event, y, mo, d, addressRaw, corpNumber] = m;
  const { name, entityType } = splitNameAndType(nameAndType);
  const eventDate = parseGazetteDate(y, mo, d);
  if (!eventDate || !name) return null;
  const addr = parseAddress(addressRaw);
  return {
    corpNumber, name, nameNorm: normalizeName(name), entityType,
    event, section: "registrations",
    eventDate, issue, issueDate,
    address: addr.full, city: addr.city, postal: addr.postal,
  };
}

/** Section 2: corporate name changes */
function parseNameChangeLine(line, issue, issueDate) {
  const m = line.match(/^(.+?)\s+(Incorporated|Registered|Continued)\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s+New Name:\s+(.+?)\.\s+Effective Date:\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s+No:\s+(\d+)\.\s*$/);
  if (!m) return null;
  const [, nameAndType, , , , , newName, effY, effM, effD, corpNumber] = m;
  const { name: oldName, entityType } = splitNameAndType(nameAndType);
  const eventDate = parseGazetteDate(effY, effM, effD);
  if (!eventDate || !newName) return null;
  return {
    corpNumber,
    name: newName.trim(),
    nameNorm: normalizeName(newName),
    entityType,
    event: "Renamed",
    section: "name_changes",
    eventDate, issue, issueDate,
    address: "", city: "", postal: "",
    oldName: oldName.trim(),
    oldNameNorm: normalizeName(oldName),
  };
}

/** Section 3: certificate of intent to dissolve — `<CORP> <NAME> <DATE>.` */
function parseIntentDissolveLine(line, issue, issueDate) {
  const m = line.match(/^(\d+)\s+(.+?)\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s*$/);
  if (!m) return null;
  const [, corpNumber, name, y, mo, d] = m;
  const eventDate = parseGazetteDate(y, mo, d);
  if (!eventDate || !name) return null;
  return {
    corpNumber,
    name: name.trim(),
    nameNorm: normalizeName(name),
    event: "Intent To Dissolve",
    section: "intent_dissolve",
    eventDate, issue, issueDate,
    address: "", city: "", postal: "",
  };
}

/** Section 4/5: liable + struck (both NAME-ONLY — same shape) */
function parseNameOnlyLine(line, issue, issueDate, event, section) {
  const m = line.match(/^(.+?)\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s*$/);
  if (!m) return null;
  const [, name, y, mo, d] = m;
  const eventDate = parseGazetteDate(y, mo, d);
  if (!eventDate || !name) return null;
  return {
    corpNumber: "",
    name: name.trim(),
    nameNorm: normalizeName(name),
    event, section,
    eventDate, issue, issueDate,
    address: "", city: "", postal: "",
  };
}

/** Section 6: revived / reinstated / restored */
function parseRevivedLine(line, issue, issueDate) {
  const m = line.match(/^(.+?)\s+(Incorporated|Registered|Continued)\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s+Struck-Off The Alberta Register\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s+Revived\s+(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\.\s+No:\s+(\d+)\.\s*$/);
  if (!m) return null;
  const [, nameAndType, , , , , , , , revY, revM, revD, corpNumber] = m;
  const { name, entityType } = splitNameAndType(nameAndType);
  const eventDate = parseGazetteDate(revY, revM, revD);
  if (!eventDate || !name) return null;
  return {
    corpNumber, name, nameNorm: normalizeName(name), entityType,
    event: "Revived",
    section: "revived",
    eventDate, issue, issueDate,
    address: "", city: "", postal: "",
  };
}

/** Section 7: amalgamations — multi-line block state machine.
 *  Returns an array of events (one per amalgamation notice). */
function parseAmalgamations(lines, issue, issueDate) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^Notice is hereby given/i.test(lines[i].trim())) { i++; continue; }
    i++;

    /* Collect predecessor names — tab-indented lines up until the
       "were on <DATE> amalgamated" marker line. */
    const predecessors = [];
    while (i < lines.length && !/^were on \d{4}/i.test(lines[i].trim())) {
      const trimmed = lines[i].trim();
      if (trimmed) predecessors.push(trimmed);
      i++;
    }

    /* "were on <DATE> amalgamated as one corporation under the name" line */
    if (i >= lines.length) break;
    const wereLine = lines[i].trim();
    const dm = wereLine.match(/^were on (\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\s+amalgamated/i);
    const eventDate = dm ? parseGazetteDate(dm[1], dm[2], dm[3]) : null;
    i++;

    /* Collect new-corp lines up until "No. <NUM>" */
    const newLines = [];
    let corpNumber = "";
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      const noM = trimmed.match(/^No\.?\s*(\d+)/i);
      if (noM) { corpNumber = noM[1]; i++; break; }
      if (trimmed) newLines.push(trimmed);
      i++;
    }
    const newName = (newLines[0] || "").trim();

    /* Registered office block */
    const officeLines = [];
    if (i < lines.length && /^The registered office/i.test(lines[i].trim())) {
      i++;
      while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (!trimmed || /^Notice is hereby given/i.test(trimmed)) break;
        officeLines.push(trimmed);
        i++;
      }
    }
    const addr = officeLines.length
      ? parseAddress(officeLines.join(", "))
      : { full: "", city: "", postal: "" };

    if (newName && eventDate) {
      out.push({
        corpNumber, name: newName, nameNorm: normalizeName(newName),
        entityType: "",
        event: "Amalgamated",
        section: "amalgamations",
        eventDate, issue, issueDate,
        address: addr.full, city: addr.city, postal: addr.postal,
        predecessors: predecessors.map((n) => normalizeName(n)).filter(Boolean),
      });
    }
  }
  return out;
}

/* ── file parser ───────────────────────────────────────────────── */

function extractPreContent(html) {
  const m = html.match(/<PRE[^>]*>([\s\S]*?)<\/PRE>/i);
  return m ? m[1] : html;
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function parseFile(fpath) {
  const raw = fs.readFileSync(fpath, "utf-8");
  const pre = extractPreContent(raw);
  const text = decodeEntities(stripHtml(pre));
  const lines = text.split(/\r?\n/);

  const issue     = issueFromPath(fpath);
  const issueDate = issueDateFromPath(fpath);

  const events = [];
  let section = null;
  let amalgamationBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    /* Section header — reset state */
    const detected = detectSection(raw);
    if (detected) {
      if (section === "amalgamations" && amalgamationBuffer.length) {
        events.push(...parseAmalgamations(amalgamationBuffer, issue, issueDate));
        amalgamationBuffer = [];
      }
      section = detected;
      continue;
    }

    /* Skip the sub-header lines (parenthetical section descriptions) and
       divider bars we see in the source. */
    if (/^\(.+\)$/.test(trimmed))     continue;   // "(Business Corporations Act, ...)"
    if (/^_{5,}$/.test(trimmed))       continue;  // divider "______"
    if (/^SERVICE ALBERTA/i.test(trimmed)) continue; // ministry banner
    if (/^Cancellation of Registration$/i.test(trimmed)) continue; // 2nd line of the liable header

    if (!section) continue;

    let ev = null;
    switch (section) {
      case "registrations":   ev = parseRegistrationLine(trimmed, issue, issueDate); break;
      case "name_changes":    ev = parseNameChangeLine(trimmed, issue, issueDate);   break;
      case "intent_dissolve": ev = parseIntentDissolveLine(trimmed, issue, issueDate); break;
      case "liable":          ev = parseNameOnlyLine(trimmed, issue, issueDate, "Liable For Dissolution", "liable"); break;
      case "struck":          ev = parseNameOnlyLine(trimmed, issue, issueDate, "Dissolved/Struck Off",    "struck"); break;
      case "revived":         ev = parseRevivedLine(trimmed, issue, issueDate);      break;
      case "amalgamations":
        amalgamationBuffer.push(raw);
        break;
    }
    if (ev) events.push(ev);
  }

  /* Flush the trailing amalgamations buffer if the file ends inside that section */
  if (section === "amalgamations" && amalgamationBuffer.length) {
    events.push(...parseAmalgamations(amalgamationBuffer, issue, issueDate));
  }

  return events;
}

/* ── writers ───────────────────────────────────────────────────── */

async function ensureIndexes(db) {
  const events    = db.collection("events");
  const companies = db.collection("companies");

  await events.createIndex(
    { issue: 1, corpNumber: 1, companyNameNorm: 1, event: 1 },
    { unique: true, name: "uniq_event_replay" },
  );
  await events.createIndex({ corpNumber: 1, eventDate: -1 }, { name: "corp_timeline" });
  await events.createIndex({ event: 1, eventDate: -1 },      { name: "event_watchlist" });

  await companies.createIndex({ nameNorm: 1 }, { name: "name_norm" });
  await companies.createIndex({ "address.city": 1, "status.derived": 1 }, { name: "city_status" });
  await companies.createIndex({ "status.derived": 1, "status.lastEventDate": -1 }, { name: "status_recent" });
  await companies.createIndex({ slug: 1 }, { unique: true, name: "slug_unique", sparse: true });
  await companies.createIndex({ "contact.enrichStatus": 1 }, { name: "enrich_queue" });
  /* /admin/companies filter/sort indexes — added alongside the
     firstEventDate rollout so future ingests keep them warm. */
  await companies.createIndex({ firstEventDate: -1 },        { name: "first_event_desc" });
  await companies.createIndex({ "status.lastEventDate": -1 }, { name: "last_event_desc" });
  await companies.createIndex({ entityType: 1, "status.derived": 1 }, { name: "entity_status" });
  try {
    await companies.createIndex({ name: "text" }, { name: "name_text", default_language: "english" });
  } catch (e) {
    if (e?.code !== 85 && e?.code !== 86) throw e;
  }
}

async function writeEvents(db, events, stats) {
  if (!events.length) return;
  const docs = events.map((e) => ({
    corpNumber:      e.corpNumber ?? "",
    companyNameNorm: e.nameNorm,
    event:           e.event,
    section:         e.section,
    eventDate:       e.eventDate,
    issue:           e.issue,
    issueDate:       e.issueDate,
    address:         e.address ?? "",
    city:            e.city ?? "",
    postal:          e.postal ?? "",
    entityType:      e.entityType ?? "",
    ...(e.oldName       ? { oldName:       e.oldName,       oldNameNorm: e.oldNameNorm } : {}),
    ...(e.predecessors  ? { predecessors:  e.predecessors  } : {}),
  }));

  const CHUNK = 2000;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    try {
      const res = await db.collection("events").insertMany(chunk, { ordered: false });
      stats.eventsInserted += res.insertedCount ?? 0;
    } catch (e) {
      stats.eventsInserted += e?.result?.insertedCount ?? e?.insertedCount ?? 0;
      const writeErrs = e?.writeErrors ?? e?.result?.writeErrors ?? [];
      const dups  = writeErrs.filter((w) => w.code === 11000).length;
      const other = writeErrs.length - dups;
      stats.eventsDup    += dups;
      stats.eventsErrors += other;
    }
  }
}

/** Guarded aggregation-pipeline upsert — advance status.* only when the
 *  incoming event is at least as fresh as what's stored. */
function buildCompanyUpdate(e) {
  const dateExpr = e.eventDate ?? null;
  const guardCondition = {
    $or: [
      { $eq: [{ $ifNull: ["$status.lastEventDate", null] }, null] },
      { $lte: [{ $ifNull: ["$status.lastEventDate", null] }, dateExpr] },
    ],
  };
  const setFields = {
    name:     e.name,
    nameNorm: e.nameNorm,
    slug:     makeSlug(e.name, e.corpNumber),
  };
  if (e.entityType) setFields.entityType = e.entityType;

  const pipeline = [
    {
      $set: {
        ...setFields,
        "status.derived":       { $cond: [guardCondition, e.event,       { $ifNull: ["$status.derived", e.event] }] },
        "status.lastEventDate": { $cond: [guardCondition, dateExpr,      "$status.lastEventDate"] },
        "status.lastIssue":     { $cond: [guardCondition, e.issue,       "$status.lastIssue"] },
        "status.lastIssueDate": { $cond: [guardCondition, e.issueDate,   "$status.lastIssueDate"] },
        "status.live":          { $ifNull: ["$status.live", null] },
        "status.liveCheckedAt": { $ifNull: ["$status.liveCheckedAt", null] },
        /* Always the earliest event we've ever seen for this corp. Uses $min
           so out-of-order ingests can't corrupt it — an older event
           processed later still wins. Populated retroactively by
           scripts/backfill_first_event_date.mjs. */
        firstEventDate: {
          $cond: [
            { $ifNull: ["$firstEventDate", false] },
            { $min: ["$firstEventDate", dateExpr] },
            dateExpr,
          ],
        },
        contact: { $ifNull: ["$contact", {
          email: null, emailSourceUrl: null, website: null, phone: null,
          enrichedAt: null, enrichStatus: "pending",
        }]},
        outreach: { $ifNull: ["$outreach", {
          lastEmailAt: null, sequenceStep: 0, replied: false, orderId: null,
        }]},
      },
    },
  ];

  /* Address only overwrites when we have one — protects prior addresses
     from being wiped by name-only rows (liable / struck). */
  if (e.address || e.city || e.postal) {
    pipeline[0].$set.address = {
      full:   e.address || "",
      city:   e.city    || "",
      postal: e.postal  || "",
    };
  }

  return pipeline;
}

/** Build the bulkWrite operation for a single event's guarded upsert. */
function buildUpsertOp(e) {
  const isNameOnly = !e.corpNumber;
  const _id = isNameOnly ? `name:${e.nameNorm}` : e.corpNumber;
  return {
    updateOne: {
      filter: { _id },
      update: buildCompanyUpdate(e),
      upsert: true,
    },
  };
}

async function upsertCompanies(db, events, stats) {
  const companies = db.collection("companies");

  /* Optional: name-only shell merge — for the delta case where the DB has
     grown organically. Skipped by default because it costs an extra findOne
     per numbered event, which crushes throughput on initial load. */
  if (MERGE_SHELLS) {
    const numbered = events.filter((e) => e.corpNumber);
    for (const e of numbered) {
      const shellId = `name:${e.nameNorm}`;
      const shell = await companies.findOne({ _id: shellId }, { projection: { contact: 1, outreach: 1 } });
      if (!shell) continue;
      const migrated = {};
      if (shell.contact)  migrated.contact  = shell.contact;
      if (shell.outreach) migrated.outreach = shell.outreach;
      if (Object.keys(migrated).length) {
        await companies.updateOne({ _id: e.corpNumber }, { $set: migrated }, { upsert: true });
      }
      await companies.deleteOne({ _id: shellId });
      stats.mergedShells++;
    }
  }

  /* Bulk upsert — batches many aggregation-pipeline updates into one
     round trip. This is the difference between hours and minutes on the
     full 1.5M-event backfill. */
  const ops = events.map(buildUpsertOp);
  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    const chunk = ops.slice(i, i + BULK_CHUNK);
    try {
      const res = await companies.bulkWrite(chunk, { ordered: false });
      stats.companiesUpserted += (res.upsertedCount ?? 0) + (res.matchedCount ?? 0);
    } catch (err) {
      /* Partial batch failures — count what did land, log the rest */
      stats.companiesUpserted += (err.result?.upsertedCount ?? 0) + (err.result?.matchedCount ?? 0);
      const writeErrs = err?.writeErrors ?? err?.result?.writeErrors ?? [];
      stats.companiesErrors += writeErrs.length;
      if (writeErrs.length && VERBOSE) {
        console.warn(`    ${writeErrs.length} bulkWrite errors in chunk (${writeErrs.slice(0, 2).map((w) => w.errmsg?.slice(0, 120)).join(" | ")})`);
      }
    }
  }
}

/* ── main ──────────────────────────────────────────────────────── */

async function processFile(db, fpath, stats) {
  const t0 = Date.now();
  const events = parseFile(fpath);
  const parsed = events.length;
  stats.eventsParsed += parsed;

  const bySection = {};
  for (const e of events) bySection[e.section] = (bySection[e.section] ?? 0) + 1;

  if (!DRY && events.length) {
    await writeEvents(db, events, stats);
    await upsertCompanies(db, events, stats);
  } else if (DRY) {
    stats.eventsInserted    += parsed;
    stats.companiesUpserted += parsed;
  }

  const ms = Date.now() - t0;
  const summary = Object.entries(bySection).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`  ${path.basename(fpath)} · ${parsed.toLocaleString()} events (${summary}) · ${ms}ms`);
}

async function main() {
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
    if (!DRY && DROP_FIRST) {
      console.log(`⚠  --drop-first: dropping database "${DB_NAME}"`);
      await db.dropDatabase();
    }
    if (!DRY) {
      console.log("ensuring indexes…");
      await ensureIndexes(db);
      if (INDEX_ONLY) { console.log("indexes done — exiting (--ensure-indexes)"); return; }
    } else if (INDEX_ONLY) {
      console.log("--ensure-indexes ignored under --dry-run");
    }

    const files = discoverFiles();
    if (!files.length) {
      console.log(`no matching files under ${ROOT}${YEAR ? `/${YEAR}` : ""}`);
      return;
    }
    console.log(`processing ${files.length} file(s)${DRY ? " (dry-run)" : ""}…`);

    const stats = {
      files: 0, eventsParsed: 0,
      eventsInserted: 0, eventsDup: 0, eventsErrors: 0,
      companiesUpserted: 0, companiesErrors: 0, mergedShells: 0,
    };
    const startedAt = Date.now();

    for (const f of files) {
      await processFile(db, f, stats);
      stats.files++;
      if (stats.files % 20 === 0) {
        const secs = (Date.now() - startedAt) / 1000;
        const rate = Math.round(stats.eventsParsed / secs);
        console.log(`— progress: ${stats.files}/${files.length} files · ${stats.eventsParsed.toLocaleString()} events · ${rate.toLocaleString()}/s`);
      }
    }

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\ndone in ${secs}s`);
    console.log(`  files:                ${stats.files}`);
    console.log(`  events parsed:        ${stats.eventsParsed.toLocaleString()}`);
    console.log(`  events inserted:      ${stats.eventsInserted.toLocaleString()}`);
    console.log(`  events dup (replays): ${stats.eventsDup.toLocaleString()}`);
    console.log(`  events errored:       ${stats.eventsErrors}`);
    console.log(`  companies upserted:   ${stats.companiesUpserted.toLocaleString()}`);
    console.log(`  companies errored:    ${stats.companiesErrors}`);
    console.log(`  name-only shells merged: ${stats.mergedShells}`);
  } finally {
    if (client) await client.close();
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
