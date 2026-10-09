import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/mongo";

/**
 * POST /api/admin/retention-sweep[?dry=1]
 *
 * Deletes what the Privacy Policy (section 6, Oct 2026) says is kept "up to 24
 * months": unfinished order forms and enquiries that never became an order,
 * and website analytics. Called weekly by .github/workflows/retention-sweep.yml
 * with Bearer ADMIN_SWEEP_TOKEN. `dry=1` counts without deleting.
 *
 * Never touched: outreach_suppression (unsubscribes are kept to honour them),
 * pricing_overrides, cms_articles, gsc_snapshots, digest_runs, and the registry
 * database (public corporate records, not personal information we collected).
 * Orders live in Stripe and docu10, which keep them seven years.
 *
 * docu10 runs the matching clean-up for its own leads (lib/retention.ts there).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MONTHS = 24;

/* collection → the date that marks "last contact" for that record. */
const RULES: [string, string][] = [
  ["pageviews", "ts"],
  ["clicks", "ts"],
  ["searches", "ts"],
  ["order_drafts", "updatedAt"],
  ["search_leads", "createdAt"],
  ["inbound_messages", "createdAt"],
  ["incorporation_consultation_requests", "createdAt"],
  ["nfp_consultation_requests", "createdAt"],
  ["minutebook_pilot_requests", "createdAt"],
  ["outreach_sends", "sentAt"],
  ["outreach_tokens", "createdAt"],
];

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SWEEP_TOKEN?.trim();
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS);

  const database = await db();
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const counts: Record<string, number> = {};
  try {
    for (const [name, field] of RULES) {
      if (!existing.has(name)) continue;
      const filter = { [field]: { $lt: cutoff } };
      const col = database.collection(name);
      counts[name] = dry ? await col.countDocuments(filter) : (await col.deleteMany(filter)).deletedCount;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[CRS] retention sweep failed:", error);
    return NextResponse.json({ ok: false, error, counts }, { status: 500 });
  }
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  if (!dry) {
    await database.collection<{ _id: string; at: Date; counts: Record<string, number> }>("digest_runs")
      .updateOne({ _id: "retention-sweep" }, { $set: { at: new Date(), counts } }, { upsert: true })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true, dry, cutoff: cutoff.toISOString().slice(0, 10), total, counts });
}
