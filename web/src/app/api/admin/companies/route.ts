import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { companies } from "@/lib/registrar-mongo";
import type { Filter } from "mongodb";
import type { CompanyDoc } from "@/lib/registrar-mongo";

/**
 * GET /api/admin/companies
 *
 * Filtered + paginated view of the `crs.companies` collection. Powers the
 * /admin/companies operator tab. All params are optional; empty request
 * returns the latest 50 corps by lastEventDate desc.
 *
 * Query params:
 *   status       csv of status.derived values (Incorporated, Struck, Revived, ...)
 *   entity       csv of entityType values (Numbered, Named, Federal, Other Prov, ...)
 *   firstFrom    ISO date; firstEventDate >= this  (incorp anniversary window start)
 *   firstTo      ISO date; firstEventDate <= this
 *   lastFrom     ISO date; status.lastEventDate >= this
 *   lastTo       ISO date; status.lastEventDate <= this
 *   city         substring match on address.city (case-insensitive)
 *   q            substring match on name / corp number
 *   emailed      "false" → only corps that have a contact email but no
 *                outreach.lastEmailAt (never-emailed prospects)
 *   enriched     "false" → only corps whose contact.enrichStatus is
 *                "pending" (not-yet-enriched — enrichment queue)
 *   sort         one of: lastEvent | firstEvent | name           (default: lastEvent)
 *   dir          one of: asc | desc                              (default: desc)
 *   limit        1..200 (default: 50)
 *   skip         0..10000 (default: 0). Beyond that, tighten the filter.
 *
 * Response:
 *   { results: Company[], total: number, skip, limit, hasMore }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;
const MAX_SKIP  = 10_000;

/** Everything the /admin/companies table cares about. Deliberately narrow
 *  — we don't ship the whole doc so a page of 50 rows stays under ~30 KB. */
type CompanyRow = {
  corpNumber:    string;
  name:          string;
  entityType:    string;
  city:          string;
  postal:        string;
  status:        string;                    // status.derived
  lastEventDate: string | null;             // ISO
  lastIssue:     string;
  firstEventDate: string | null;            // ISO
  live:          string | null;
  enrichStatus:  string | null;
  suppressed:    boolean;
  email:         string | null;
  phone:         string | null;
  website:       string | null;
};

function toIso(d: unknown): string | null {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === "string") return d;
  return null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function csv(s: string | null): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Serialize a Mongo doc into the row shape the client renders. */
function serialize(doc: CompanyDoc): CompanyRow {
  return {
    corpNumber:     String(doc._id ?? ""),
    name:           doc.name ?? "",
    entityType:     doc.entityType ?? "",
    city:           doc.address?.city ?? "",
    postal:         doc.address?.postal ?? "",
    status:         doc.status?.derived ?? "",
    lastEventDate:  toIso(doc.status?.lastEventDate),
    lastIssue:      doc.status?.lastIssue ?? "",
    firstEventDate: toIso(doc.firstEventDate),
    live:           doc.status?.live ?? null,
    enrichStatus:   doc.contact?.enrichStatus ?? null,
    suppressed:     !!doc.contact?.suppressed,
    email:          doc.contact?.email ?? null,
    phone:          doc.contact?.phone ?? null,
    website:        doc.contact?.website ?? null,
  };
}

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(req.url);

  const statuses = csv(url.searchParams.get("status"));
  const entities = csv(url.searchParams.get("entity"));
  const firstFrom = parseDate(url.searchParams.get("firstFrom"));
  const firstTo   = parseDate(url.searchParams.get("firstTo"));
  const lastFrom  = parseDate(url.searchParams.get("lastFrom"));
  const lastTo    = parseDate(url.searchParams.get("lastTo"));
  const city      = (url.searchParams.get("city") ?? "").trim();
  const q         = (url.searchParams.get("q") ?? "").trim();
  const emailed   = (url.searchParams.get("emailed") ?? "").trim();
  const enriched  = (url.searchParams.get("enriched") ?? "").trim();
  const sort      = (url.searchParams.get("sort") ?? "lastEvent").trim();
  const dir       = (url.searchParams.get("dir")  ?? "desc").trim();
  const limit     = Math.max(1,  Math.min(MAX_LIMIT, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const skip      = Math.max(0,  Math.min(MAX_SKIP,  parseInt(url.searchParams.get("skip")  ?? "0",  10) || 0));

  /* Build filter. Name-only shell docs (_id starts with "name:") are always
     excluded — they represent name-only gazette notices without a corp
     number, not real corps the operator would want to segment on. */
  const filter: Filter<CompanyDoc> = { _id: { $not: { $regex: "^name:" } } };

  if (statuses.length) filter["status.derived"] = { $in: statuses };
  if (entities.length) filter.entityType        = { $in: entities };

  if (firstFrom || firstTo) {
    filter.firstEventDate = {};
    if (firstFrom) (filter.firstEventDate as Record<string, unknown>).$gte = firstFrom;
    if (firstTo)   (filter.firstEventDate as Record<string, unknown>).$lte = firstTo;
  }

  if (lastFrom || lastTo) {
    filter["status.lastEventDate"] = {};
    if (lastFrom) (filter["status.lastEventDate"] as Record<string, unknown>).$gte = lastFrom;
    if (lastTo)   (filter["status.lastEventDate"] as Record<string, unknown>).$lte = lastTo;
  }

  if (city) {
    // Anchored prefix match — leverages the address.city index and avoids
    // a full-collection regex scan.
    filter["address.city"] = { $regex: `^${escapeRegex(city)}`, $options: "i" };
  }

  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { name:       rx },
      { _id:        rx },        // matches by corp number
    ];
  }

  /* "Never-emailed prospects" — has a contact email but no outreach
     lastEmailAt. Best combined with a status filter to narrow the working
     set first (e.g. status=Incorporated + emailed=false). */
  if (emailed === "false") {
    filter["contact.email"]        = { $ne: null };
    filter["outreach.lastEmailAt"] = null;
  }

  /* "Not yet enriched" — enrichment queue. contact.enrichStatus is
     $ifNull-initialized to "pending" by the ingest, so this is a
     single-key equality that uses the enrich_queue index. */
  if (enriched === "false") {
    filter["contact.enrichStatus"] = "pending";
  }

  const sortSpec: Record<string, 1 | -1> = {};
  const sortDir: 1 | -1 = dir === "asc" ? 1 : -1;
  if      (sort === "firstEvent") sortSpec.firstEventDate         = sortDir;
  else if (sort === "name")       sortSpec.nameNorm               = sortDir;
  else                            sortSpec["status.lastEventDate"] = sortDir;
  // Stable tiebreaker so pagination doesn't jitter when multiple docs
  // share the same sort key.
  sortSpec._id = 1;

  const c = await companies();

  const [docs, total] = await Promise.all([
    c.find(filter, {
      projection: {
        name: 1, entityType: 1, address: 1, status: 1,
        firstEventDate: 1, contact: 1,
      },
    })
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .toArray(),
    // countDocuments is exact but can be slow on wide filters; the indexes
    // we added make the common combos snappy. If this becomes a bottleneck
    // switch to estimatedDocumentCount + separate count for filtered.
    c.countDocuments(filter),
  ]);

  return NextResponse.json({
    results: docs.map(serialize),
    total,
    skip,
    limit,
    hasMore: skip + docs.length < total,
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
