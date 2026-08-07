#!/usr/bin/env node
/**
 * One-shot cleanup — merges name-only shell docs (`_id: "name:<NORM>"`)
 * into their numbered counterparts when both exist. Runs after the initial
 * bulk load where `--merge-shells` was disabled for throughput.
 *
 * For each shell:
 *   1. Look for a numbered doc with the same nameNorm.
 *   2. If found and shell is NEWER than the numbered doc's lastEventDate,
 *      migrate status.* (derived, lastEventDate, lastIssue, lastIssueDate)
 *      onto the numbered doc.
 *   3. Copy contact/outreach only if the numbered doc's are still defaults
 *      (avoid clobbering enrichment work).
 *   4. Delete the shell.
 *   5. If NO numbered match: leave the shell alone — it's a real name-only
 *      corp gazetted before our parser window (pre-2006) or one whose
 *      incorporation event never appeared in our data.
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/merge_shells.mjs
 *   node scripts/merge_shells.mjs --dry-run
 *   node scripts/merge_shells.mjs --batch 500
 *
 * Env: MONGODB_URI, DB_NAME  (defaults: localhost:27017, "crs")
 */

import { MongoClient } from "mongodb";

const args   = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const DRY   = args.includes("--dry-run");
const BATCH = parseInt(argVal("--batch", "500"), 10);
const LOG_EVERY = parseInt(argVal("--log-every", "10000"), 10);

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const DB_NAME     = process.env.DB_NAME     ?? "crs";

/** True if the numbered doc has essentially empty contact/outreach — safe
 *  to overwrite with the shell's values (which might carry future
 *  enrichment). Never clobber real enrichment data. */
function isEmptyContact(c) {
  if (!c) return true;
  return !c.email && !c.website && !c.phone && !c.emailSourceUrl &&
         (c.enrichStatus === "pending" || !c.enrichStatus);
}
function isEmptyOutreach(o) {
  if (!o) return true;
  return !o.lastEmailAt && (o.sequenceStep ?? 0) === 0 && !o.replied && !o.orderId;
}

async function main() {
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`connected to ${DB_NAME} @ ${MONGODB_URI.replace(/\/\/[^@]*@/, "//<creds>@")}`);
  if (DRY) console.log("dry-run: no writes will occur");

  const companies = db.collection("companies");
  const totalShells = await companies.countDocuments({ _id: /^name:/ });
  console.log(`shells to inspect: ${totalShells.toLocaleString()}`);

  const stats = {
    inspected: 0, merged: 0, orphans: 0,
    statusAdvanced: 0, contactMigrated: 0, outreachMigrated: 0,
  };
  const startedAt = Date.now();

  const cursor = companies.find(
    { _id: /^name:/ },
    { projection: { _id: 1, nameNorm: 1, status: 1, contact: 1, outreach: 1 } },
  );

  let batch = [];

  async function flushBatch() {
    if (!batch.length) return;

    // Bulk lookup: find all numbered docs matching this batch's nameNorms
    const norms = [...new Set(batch.map((s) => s.nameNorm))];
    const numbered = await companies.find(
      { nameNorm: { $in: norms }, _id: { $not: /^name:/ } },
      { projection: { _id: 1, nameNorm: 1, status: 1, contact: 1, outreach: 1 } },
    ).toArray();

    // Group numbered docs by nameNorm — a shell can theoretically match
    // multiple numbered docs (same trade name registered separately);
    // pick the freshest as the merge target.
    const byNorm = new Map();
    for (const n of numbered) {
      const cur = byNorm.get(n.nameNorm);
      const nDate  = n.status?.lastEventDate?.getTime() ?? 0;
      const cDate  = cur?.status?.lastEventDate?.getTime() ?? -1;
      if (!cur || nDate > cDate) byNorm.set(n.nameNorm, n);
    }

    const ops = [];
    for (const shell of batch) {
      const match = byNorm.get(shell.nameNorm);
      if (!match) { stats.orphans++; continue; }

      // Build the migration payload
      const shellDate = shell.status?.lastEventDate?.getTime() ?? 0;
      const matchDate = match.status?.lastEventDate?.getTime() ?? 0;

      const setFields = {};
      if (shellDate > matchDate) {
        // Shell has a fresher event — advance the numbered doc's status
        setFields["status.derived"]       = shell.status.derived;
        setFields["status.lastEventDate"] = shell.status.lastEventDate;
        setFields["status.lastIssue"]     = shell.status.lastIssue;
        if (shell.status.lastIssueDate) {
          setFields["status.lastIssueDate"] = shell.status.lastIssueDate;
        }
        stats.statusAdvanced++;
      }
      if (isEmptyContact(match.contact) && !isEmptyContact(shell.contact)) {
        setFields.contact = shell.contact;
        stats.contactMigrated++;
      }
      if (isEmptyOutreach(match.outreach) && !isEmptyOutreach(shell.outreach)) {
        setFields.outreach = shell.outreach;
        stats.outreachMigrated++;
      }

      if (Object.keys(setFields).length) {
        ops.push({ updateOne: { filter: { _id: match._id }, update: { $set: setFields } } });
      }
      ops.push({ deleteOne: { filter: { _id: shell._id } } });
      stats.merged++;
    }

    if (!DRY && ops.length) {
      try {
        await companies.bulkWrite(ops, { ordered: false });
      } catch (e) {
        console.warn(`  bulkWrite partial failure: ${e.message?.slice(0, 200)}`);
      }
    }

    stats.inspected += batch.length;
    batch = [];

    if (stats.inspected % LOG_EVERY < BATCH) {
      const secs = (Date.now() - startedAt) / 1000;
      const rate = Math.round(stats.inspected / secs);
      console.log(
        `  ${stats.inspected.toLocaleString()} / ${totalShells.toLocaleString()} shells · ` +
        `merged ${stats.merged.toLocaleString()} · orphans ${stats.orphans.toLocaleString()} · ` +
        `${rate.toLocaleString()}/s`,
      );
    }
  }

  for await (const shell of cursor) {
    batch.push(shell);
    if (batch.length >= BATCH) await flushBatch();
  }
  await flushBatch();

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\ndone in ${secs}s`);
  console.log(`  shells inspected:       ${stats.inspected.toLocaleString()}`);
  console.log(`  merged (deleted shell): ${stats.merged.toLocaleString()}`);
  console.log(`  status advanced on numbered doc: ${stats.statusAdvanced.toLocaleString()}`);
  console.log(`  contact fields migrated:         ${stats.contactMigrated.toLocaleString()}`);
  console.log(`  outreach fields migrated:        ${stats.outreachMigrated.toLocaleString()}`);
  console.log(`  orphans (no numbered match):     ${stats.orphans.toLocaleString()}`);

  await client.close();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
