import { NextResponse } from "next/server";

/** GET /api/pei/entity/[id] — retired 2026-09-25 (see /api/pei/search). */
export async function GET() {
  return NextResponse.json({ error: "PEI lookup is not available." }, { status: 410 });
}
