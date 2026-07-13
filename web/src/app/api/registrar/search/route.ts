import { NextResponse } from "next/server";
import { companies } from "@/lib/registrar-mongo";

/**
 * GET /api/registrar/search?q=...
 *
 * DB-only text search over the Alberta registrar corpus. Used by the
 * autocomplete dropdown on /file-annual-return/alberta — no live API calls
 * here (those fire only on profile-page view per the cost-control policy).
 *
 * Strategy per query type:
 *   - Numeric query (any digits) → prefix match on both `_id` (corp number)
 *     AND `nameNorm` (numbered-corp names like "1202503 ALBERTA LTD"), then
 *     union the results.
 *   - Text query → `$text` search on the name text index PLUS a nameNorm
 *     prefix match for typo/partial cases ("acme wid" should still match
 *     "ACME WIDGETS LTD").
 *
 * Returns the top 20 hits with just enough for a preview row.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECTION = {
  name: 1,
  entityType: 1,
  slug: 1,
  "status.derived": 1,
  "status.lastEventDate": 1,
  "status.lastIssueDate": 1,
  "address.city": 1,
};

/** Escape regex-special chars from user input before injecting into a
 *  Mongo `$regex` filter. Prevents ReDoS + accidental regex matching. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q   = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const col = await companies();
    const rawQ = escapeRegex(q);
    const isNumeric = /^\d+$/.test(q);

    /* Collect hits from several strategies. Order matters — earlier hits
       take precedence in dedupe. */
    const merged = new Map<string, Record<string, unknown>>();

    if (isNumeric) {
      /* 1a. Exact _id match (fastest — index-backed) */
      const exact = await col.findOne({ _id: q }, { projection: PROJECTION });
      if (exact) merged.set(String(exact._id), exact);

      /* 1b. _id prefix — corp numbers starting with the input */
      const idPrefixHits = await col.find(
        { _id: { $regex: `^${rawQ}` } },
        { projection: PROJECTION },
      ).limit(limit).toArray();
      for (const h of idPrefixHits) {
        const k = String(h._id);
        if (!merged.has(k)) merged.set(k, h);
      }

      /* 1c. nameNorm prefix — numbered corp names start with the number
             (e.g., "1202503 ALBERTA LTD" for corp #2012025033). */
      if (merged.size < limit) {
        const nameHits = await col.find(
          { nameNorm: { $regex: `^${rawQ}\\b` } },
          { projection: PROJECTION },
        ).limit(limit).toArray();
        for (const h of nameHits) {
          const k = String(h._id);
          if (!merged.has(k)) merged.set(k, h);
        }
      }
    } else {
      /* 2a. nameNorm prefix — catches partial phrases like "acme wid" */
      const upper = q.toUpperCase();
      const prefixHits = await col.find(
        { nameNorm: { $regex: `^${escapeRegex(upper)}` } },
        { projection: PROJECTION },
      ).limit(limit).toArray();
      for (const h of prefixHits) {
        const k = String(h._id);
        if (!merged.has(k)) merged.set(k, h);
      }

      /* 2b. $text search — catches non-prefix word matches
             (mind: $text can't be combined with the prefix filter above via
              $or, so we run it separately) */
      if (merged.size < limit) {
        const textHits = await col.find(
          { $text: { $search: q } },
          { projection: { ...PROJECTION, score: { $meta: "textScore" } } },
        )
          .sort({ score: { $meta: "textScore" } })
          .limit(limit)
          .toArray();
        for (const h of textHits) {
          const k = String(h._id);
          if (!merged.has(k)) merged.set(k, h);
        }
      }
    }

    const rows = [...merged.values()].slice(0, limit).map((r) => {
      const isNameShell = String(r._id).startsWith("name:");
      const rr = r as {
        _id: string; slug?: string; name?: string; entityType?: string;
        status?: { derived?: string; lastEventDate?: Date; lastIssueDate?: Date };
        address?: { city?: string };
      };
      return {
        corpNumber:    isNameShell ? "" : String(rr._id),
        slug:          rr.slug ?? "",
        name:          rr.name ?? "",
        entityType:    rr.entityType ?? "",
        status:        rr.status?.derived ?? "",
        lastEventDate: rr.status?.lastEventDate ?? null,
        lastIssueDate: rr.status?.lastIssueDate ?? null,
        city:          rr.address?.city ?? "",
        isNameShell,
      };
    });

    return NextResponse.json({ results: rows });
  } catch (e) {
    /* Never 500 the search — return empty with a diagnostic tag so the
       dropdown UI stays functional even if Mongo hiccups. */
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[registrar/search] failed:", message);
    return NextResponse.json({ results: [], error: message }, { status: 200 });
  }
}
