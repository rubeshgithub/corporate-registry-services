import { NextResponse } from "next/server";
import { getPeiEntity, PeiRegistryError } from "@/lib/pei-registry";

/**
 * GET /api/pei/entity/[id]
 *
 * Fetch a single PEI corporate registry record by internal entity ID
 * (the number that PEI's own OCBR uses at /ocbr/entityHome/{id}/).
 * Search results carry the entity ID as `entityId`; this endpoint fills
 * in the fields search doesn't carry (address, owner, nature of business,
 * registration/renewal/expiry dates).
 *
 * Cached 15 min in the shared `lookups` collection.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trimmed = decodeURIComponent(id ?? "").trim();
  if (!/^\d{1,10}$/.test(trimmed)) {
    return NextResponse.json({ ok: false, error: "Invalid PEI entity id." }, { status: 400 });
  }

  try {
    const result = await getPeiEntity(trimmed);
    if (!result.record) {
      return NextResponse.json({ ok: false, error: "No record found for that entity id." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof PeiRegistryError) {
      return NextResponse.json(
        { ok: false, error: "PEI registry lookup is temporarily unavailable — please try again shortly." },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[pei/entity] failed:", msg);
    return NextResponse.json({ ok: false, error: "Lookup failed." }, { status: 500 });
  }
}
