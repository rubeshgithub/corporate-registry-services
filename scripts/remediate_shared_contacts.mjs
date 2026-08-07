#!/usr/bin/env node
/**
 * Remediation sweep — flag corps whose enrichment is a likely false
 * positive because their contact.email or contact.phone is shared with
 * another corp on the list.
 *
 * Implementation: cursor-based, sorted-scan. The 1M+ doc corpus blows
 * the $group memory limit on Atlas Flex even with allowDiskUse:true, so
 * we stream docs sorted by the target field (index-backed) and detect
 * "runs" of adjacent rows sharing a value.
 *
 * Marks contact.enrichStatus = "needs_review". Contact fields
 * (email/phone/website) are NOT cleared — the operator may recognize
 * which corp the contact actually belongs to and manually resolve.
 *
 * Usage:
 *   MONGODB_URI=… node scripts/remediate_shared_contacts.mjs [--dry-run]
 */

import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const DRY  = args.includes("--dry-run");

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = process.env.DB_NAME ?? "crs";
if (!MONGODB_URI) { console.error("MONGODB_URI is required"); process.exit(1); }

const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
await client.connect();
const companies = client.db(DB_NAME).collection("companies");

console.log(`connected to ${DB_NAME}${DRY ? " (dry-run)" : ""}`);

/** Stream docs sorted by contact[field], find runs of adjacent docs
 *  sharing the same value. Returns a Set of corp _ids to flag. */
async function findClustersByCursor(field) {
  console.log(`\nscanning shared ${field} clusters (cursor)…`);
  const t0 = Date.now();
  const cursor = companies.find(
    { [`contact.${field}`]: { $ne: null, $exists: true } },
    { projection: { _id: 1, [`contact.${field}`]: 1 } },
  ).sort({ [`contact.${field}`]: 1 });

  const flagged = new Set();
  let previous = null;
  let run      = [];
  let clusters = 0;
  let sampled  = [];
  let seen     = 0;

  const closeRun = () => {
    if (run.length >= 2) {
      clusters++;
      if (sampled.length < 5) sampled.push({ value: previous, corps: run.slice(0, 3), n: run.length });
      for (const id of run) flagged.add(id);
    }
  };

  for await (const doc of cursor) {
    seen++;
    const value = doc.contact?.[field];
    if (!value) continue;
    if (value === previous) {
      run.push(doc._id);
    } else {
      closeRun();
      previous = value;
      run      = [doc._id];
    }
    if (seen % 100000 === 0) console.log(`  scanned ${seen.toLocaleString()} docs · ${clusters} clusters so far · ${((Date.now()-t0)/1000).toFixed(0)}s`);
  }
  closeRun();

  console.log(`  scanned ${seen.toLocaleString()} docs in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  console.log(`  found ${clusters.toLocaleString()} shared-${field} clusters covering ${flagged.size.toLocaleString()} corps`);
  if (sampled.length) {
    console.log(`  top ${sampled.length} sample clusters:`);
    for (const s of sampled) {
      const val = String(s.value).slice(0, 40);
      console.log(`    ${val.padEnd(42)} × ${s.n} corps  (${s.corps.slice(0, 3).join(", ")}${s.corps.length > 3 ? " …" : ""})`);
    }
  }
  return flagged;
}

const emailFlagged = await findClustersByCursor("email");
const phoneFlagged = await findClustersByCursor("phone");

const combined = new Set([...emailFlagged, ...phoneFlagged]);
console.log(`\ntotal distinct corps queued for needs_review flag: ${combined.size.toLocaleString()}`);

if (combined.size === 0) {
  console.log("nothing to remediate. done.");
  await client.close();
  process.exit(0);
}

if (DRY) {
  console.log("dry-run: no writes performed. re-run without --dry-run to apply.");
  await client.close();
  process.exit(0);
}

console.log("\napplying contact.enrichStatus = 'needs_review' to flagged corps…");
const t0 = Date.now();
const CHUNK = 500;
const ids = [...combined];
let modified = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const batch = ids.slice(i, i + CHUNK);
  const res = await companies.updateMany(
    { _id: { $in: batch }, "contact.enrichStatus": { $ne: "needs_review" } },
    { $set: { "contact.enrichStatus": "needs_review" } },
  );
  modified += res.modifiedCount ?? 0;
  if ((i / CHUNK) % 20 === 0 && i > 0) {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  ${(i + batch.length).toLocaleString()} / ${ids.length.toLocaleString()} processed · ${modified.toLocaleString()} newly flagged · ${s}s`);
  }
}
console.log(`\ndone in ${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log(`  corps flagged (net new): ${modified.toLocaleString()}`);
console.log(`  corps flagged (already had needs_review): ${(combined.size - modified).toLocaleString()}`);

await client.close();
