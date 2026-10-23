import { NextResponse } from "next/server";
import { verifyUnsubscribe } from "@/lib/outreach-token";
import { suppressEmail } from "@/lib/unsubscribe";

/**
 * POST /api/outreach/unsubscribe    (form: e, s, t)
 *
 * The "Yes, unsubscribe me" button on /o/unsubscribe — shown only when the page judged the visitor a link
 * scanner (a real person is unsubscribed on opening the page; lib/unsubscribe.ts). Records the suppression,
 * mirrors it to crs.companies and sends the confirmation email (all in suppressEmail), then /unsubscribed.
 *
 * GET keeps old emails' GET-style links working: it redirects to /o/unsubscribe with the same query.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

export async function POST(req: Request) {
  const form  = await req.formData().catch(() => null);
  const email = String(form?.get("e") ?? "").trim().toLowerCase();
  const sig   = String(form?.get("s") ?? "").trim();
  const token = String(form?.get("t") ?? "").trim();

  if (!email || !sig || !verifyUnsubscribe(email, sig)) {
    return NextResponse.redirect(new URL("/unsubscribed?err=invalid", SITE_URL), 303);
  }
  try {
    await suppressEmail(email, token, "confirm button");
  } catch (e) {
    console.error("[outreach/unsubscribe] failed to record suppression:", e);
    return NextResponse.redirect(new URL("/unsubscribed?err=server", SITE_URL), 303);
  }
  return NextResponse.redirect(new URL(`/unsubscribed?e=${encodeURIComponent(email)}`, SITE_URL), 303);
}

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const target = new URL("/o/unsubscribe", SITE_URL);
  for (const k of ["e", "s", "t"]) { const v = url.searchParams.get(k); if (v) target.searchParams.set(k, v); }
  return NextResponse.redirect(target, 302);
}
