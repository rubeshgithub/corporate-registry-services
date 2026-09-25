import { NextResponse } from "next/server";

/**
 * POST /api/pei/search — retired 2026-09-25.
 *
 * PEI's registry API sits behind Radware Bot Manager, which answers our
 * server with a captcha redirect on every call. Nothing on the site calls this
 * route any more; it answers 410 without touching the upstream so bots hitting
 * it can't burn requests against PEI.
 */
export async function POST() {
  return NextResponse.json({ error: "PEI search is not available." }, { status: 410 });
}
