import { NextResponse } from "next/server";
import { checkNameAvailability, type Scope } from "@/lib/name-availability";

/**
 * POST /api/name-availability/check
 *
 * Free "Instant Availability Check". No auth, no email — a discovery tool.
 * The paid conversion happens on the page itself via a CTA to
 * /order/nuans-search.
 *
 * Rate-limiting isn't enforced here for MVP — CBR + a tiny Mongo prefix
 * scan are both cheap. Revisit if we see abuse.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { name?: string; scope?: Scope };

const VALID_SCOPES: Scope[] = ["all", "federal", "bc", "ab"];

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name  = String(body.name ?? "").trim();
  const scope = (VALID_SCOPES as string[]).includes(String(body.scope))
    ? (body.scope as Scope)
    : "all";

  if (name.length < 2) {
    return NextResponse.json({ error: "Please enter a proposed corporation name (at least 2 characters)." }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  try {
    const result = await checkNameAvailability(name, scope);
    return NextResponse.json({ ok: true, query: name, scope, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[name-availability/check] failed:", msg);
    /* Even on failure, don't 500 — degrade to a soft "no matches found"
     *  so the UI stays functional. The full paid NUANS is still available. */
    return NextResponse.json({
      ok:    true,
      query: name,
      scope,
      result: {
        strength:     "moderate" as const,
        matchCount:   0,
        matches:      [],
        scopeLabel:   scope === "all" ? "Canada" : scope,
        coverageNote: "The instant check is temporarily unavailable. Order the paid NUANS report below for a definitive answer.",
      },
    });
  }
}
