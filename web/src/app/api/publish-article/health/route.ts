import { NextResponse } from "next/server";

/**
 * GET /api/publish-article/health
 *
 * Unauthenticated connectivity probe for the external content-publishing
 * automation. Returns { ok: true } if the server is reachable and this
 * route is live. Does not verify the API key, GitHub token, or downstream
 * GitHub connectivity — those are only exercised on real POSTs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}
