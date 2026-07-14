import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { enrichForOutreach } from "@/lib/registrar-live";

/**
 * POST /api/admin/outreach/enrich
 *
 * On-demand contact enrichment for the outreach console drawer.
 * Body: { name, city, corpNumber }
 *
 * Cost-controlled path:
 *   1. If we already have fresh enrichment for corpNumber (< 90 days),
 *      return it from cache (either the lookups TTL cache or the Alberta
 *      companies collection).
 *   2. Otherwise fire Google Places + website crawl, cache the result.
 *
 * Fresh calls cost ~$0.02 each in Places API; cached hits are free.
 */

export const runtime = "nodejs";

type Body = {
  name?:       string;
  city?:       string;
  corpNumber?: string;
};

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const city = (body.city ?? "").trim();
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  try {
    const { result, cached, source } = await enrichForOutreach({
      name,
      city,
      corpNumber: body.corpNumber?.trim() || undefined,
    });

    if (!result) {
      return NextResponse.json({
        enriched: false,
        reason:   "Numbered corporation — no meaningful public web presence to enrich from.",
      });
    }

    return NextResponse.json({
      enriched: true,
      cached,
      source,
      contact: {
        email:          result.email,
        emailSourceUrl: result.emailSourceUrl,
        website:        result.website,
        phone:          result.phone,
        enrichedAt:     result.enrichedAt.toISOString(),
        enrichStatus:   result.enrichStatus,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Enrichment failed.";
    console.error("[outreach/enrich] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
