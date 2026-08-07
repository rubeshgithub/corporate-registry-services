#!/usr/bin/env node
/**
 * One-time backfill: populate `firstEventDate` on every companies doc from
 * the earliest event we've recorded for that corp in the events collection.
 *
 * Idempotent — only sets the field when missing, so re-running is a no-op.
 * Uses aggregation with allowDiskUse:true so it doesn't hit the 100 MB
 * memory limit on Atlas Flex when grouping across ~1.5M events.
 *
 * Also creates the compound indexes the /admin/companies filter API relies
 * on so its queries stay fast at scale.
 *
 * Usage:
 *   MONGODB_URI="…" node scripts/backfill_first_event_date.mjs
 *   MONGODB_URI="…" node scripts/backfill_first_event_date.mjs --dry-run
 */

import { MongoClient } from "mongodb";

const args   = process.argv.slice(2);
const DRY    = args.includes("--dry-run");
const CHUNK  = 500;   // bulkWrite batch size

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = process.env.DB_NAME ?? "crs";
if (!MONGODB_URI) { console.error("MONGODB_URI is required"); process.exit(1); }

const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
await client.connect();
const db        = client.db(DB_NAME);
const events    = db.collection("events");
const companies = db.collection("companies");

console.log(`connected to ${DB_NAME}${DRY ? " (dry-run)" : ""}`);

/* Aggregate: for each numbered corp, take min(eventDate). Sort by _id so
 * the cursor progresses predictably; allowDiskUse for the group stage. */
console.log("aggregating min(eventDate) per corpNumber …");
const cursor = events.aggregate(
  [
    { $match: { corpNumber: { $ne: "" } } },
    { $group: { _id: "$corpNumber", first: { $min: "$eventDate" } } },
  ],
  { allowDiskUse: true },
);

let seen = 0, batched = 0, modified = 0;
let ops = [];

async function flush() {
  if (!ops.length) return;
  if (DRY) { batched += ops.length; ops = []; return; }
  try {
    const res = await companies.bulkWrite(ops, { ordered: false });
    modified += (res.modifiedCount ?? 0);
  } catch (e) {
    console.error("bulkWrite chunk failed:", e?.message ?? e);
  }
  ops = [];
}

const t0 = Date.now();
for await (const row of cursor) {
  seen++;
  ops.push({
    updateOne: {
      filter: { _id: row._id, firstEventDate: { $exists: false } },
      update: { $set: { firstEventDate: row.first } },
    },
  });
  if (ops.length >= CHUNK) await flush();
  if (seen % 25000 === 0) {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  aggregated ${seen.toLocaleString()} corps · ${s}s · ${modified.toLocaleString()} updated so far`);
  }
}
await flush();

const s = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\ndone in ${s}s`);
console.log(`  distinct numbered corps in events: ${seen.toLocaleString()}`);
if (DRY) console.log(`  dry-run: would have queued ${batched.toLocaleString()} updateOne ops`);
else     console.log(`  companies docs modified:     ${modified.toLocaleString()}`);

/* Compound indexes the admin/companies filter API will use. Idempotent —
 * createIndex is a no-op if the index already exists with the same spec. */
if (!DRY) {
  console.log("\nensuring filter indexes on companies …");
  await companies.createIndex({ firstEventDate: -1 },        { name: "first_event_desc" });
  await companies.createIndex({ "status.lastEventDate": -1 }, { name: "last_event_desc" });
  await companies.createIndex({ entityType: 1, "status.derived": 1 }, { name: "entity_status" });
  await companies.createIndex({ "address.city": 1 }, { sparse: true, name: "city_sparse" });
  await companies.createIndex({ nameNorm: 1 }, { name: "name_norm" });
  console.log("  indexes ensured");
}

await client.close();
