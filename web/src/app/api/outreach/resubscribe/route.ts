import { NextResponse } from "next/server";
import { verifyUnsubscribe } from "@/lib/outreach-token";
import { resubscribeEmail } from "@/lib/unsubscribe";

/**
 * POST /api/outreach/resubscribe   (form: e, s) — the "Keep me subscribed" undo on /o/unsubscribe, for someone
 * unsubscribed by opening the page who did not mean to. Needs the same signature as the unsubscribe link, so
 * only the address owner's own link can do it, and it removes only an "unsubscribed" row.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

export async function POST(req: Request) {
  const form  = await req.formData().catch(() => null);
  const email = String(form?.get("e") ?? "").trim().toLowerCase();
  const sig   = String(form?.get("s") ?? "").trim();
  if (!email || !sig || !verifyUnsubscribe(email, sig)) {
    return NextResponse.redirect(new URL("/unsubscribed?err=invalid", SITE_URL), 303);
  }
  try {
    await resubscribeEmail(email);
  } catch (e) {
    console.error("[outreach/resubscribe] failed:", e);
    return NextResponse.redirect(new URL("/unsubscribed?err=server", SITE_URL), 303);
  }
  return NextResponse.redirect(new URL("/unsubscribed?kept=1", SITE_URL), 303);
}
