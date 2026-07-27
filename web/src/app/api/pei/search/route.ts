import { NextResponse } from "next/server";
import { searchPei, PeiRegistryError } from "@/lib/pei-registry";

/**
 * POST /api/pei/search
 *
 * Public PEI corporate registry search. Fronts wdf.princeedwardisland.ca —
 * see web/src/lib/pei-registry.ts for the upstream contract. Cached 15 min
 * in the shared `lookups` collection; per-user interactive use only (no
 * bulk harvesting, no ID enumeration).
 *
 * Body: { name: string, status?, companyType?, page?, pageSize?, forceRefresh? }
 * Returns: { ok, results: [], totalHint, cached, source }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?:           string;
  businessNumber?: string;
  status?:         string | null;
  companyType?:    string | null;
  page?:           number;
  pageSize?:       number;
  forceRefresh?:   boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const bn   = String(body.businessNumber ?? "").trim();

  if (!name && !bn) {
    return NextResponse.json({ ok: false, error: "Please enter a company name or business number." }, { status: 400 });
  }
  if (name && name.length < 2 && !bn) {
    return NextResponse.json({ ok: false, error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ ok: false, error: "Name is too long." }, { status: 400 });
  }

  try {
    const result = await searchPei(name, {
      businessNumber: bn || undefined,
      status:       body.status ?? null,
      companyType:  body.companyType ?? null,
      page:         body.page,
      pageSize:     body.pageSize,
      forceRefresh: body.forceRefresh,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof PeiRegistryError) {
      /* Per the brief: the upstream's error message is ambiguous — never
       *  surface it as "registry down". Return a hedged error and let the
       *  client show a "lookup unavailable, try again" message. */
      return NextResponse.json(
        { ok: false, error: "PEI registry lookup is temporarily unavailable — please try again shortly." },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[pei/search] failed:", msg);
    return NextResponse.json({ ok: false, error: "Search failed." }, { status: 500 });
  }
}
