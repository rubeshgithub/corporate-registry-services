import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * docu10's opt-out list — READ ONLY.
 *
 * docu10 (CRS's internal order and lead desk) records people who asked CRS to
 * stop commercial email: they replied "unsubscribe" to a docu10 proof-of-filing,
 * payment-link or annual-return reminder email, or staff recorded the request.
 * docu10 keeps that list in its own database on this same cluster and cannot
 * write to crs_analytics, so outreach_suppression never hears about those
 * people. CASL needs an unsubscribe to hold across all of CRS's commercial
 * email, so outreach checks both lists before it sends.
 *
 * The website must never write to docu10's database or create indexes there.
 * `_id` is the lowercased address, so a lookup by `_id` needs no index.
 */

export type Docu10OptOutDoc = {
  _id:    string;              // lowercased email address
  reason: "reply" | "staff";   // replied "unsubscribe" to a docu10 email, or staff recorded it
  at:     Date;
  by:     string;
  note:   string;
};

async function docu10OptOuts(): Promise<Collection<Docu10OptOutDoc>> {
  const dbName = process.env.DOCU10_DB_NAME?.trim() || "crs_ops";
  return (await db()).client.db(dbName).collection<Docu10OptOutDoc>("email_optouts");
}

/**
 * The addresses (trimmed, lowercased) that opted out through docu10. Throws
 * when the list cannot be read: a caller about to send must then refuse, never
 * treat the failure as "nobody opted out".
 */
export async function docu10OptedOut(emails: string[]): Promise<string[]> {
  const addrs = [...new Set(emails.map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
  if (!addrs.length) return [];
  const hits = await (await docu10OptOuts())
    .find({ _id: { $in: addrs } }, { projection: { _id: 1 }, maxTimeMS: 5000 })
    .toArray();
  const found = new Set(hits.map((h) => h._id));
  return addrs.filter((a) => found.has(a));
}
